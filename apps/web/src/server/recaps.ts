import "server-only";
import { adminBaseUrl } from "./urls";
import { anthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import { and, desc, eq, isNull, schema } from "@bookly/db";
import { loadEnv } from "@bookly/config";
import type { Booking, EventType, MeetingRecap, Task, Workspace } from "@bookly/db/schema";
import { db } from "@/lib/db";
import { bookingsVisibleTo } from "./access/hiring";
import { fmtDateTime } from "@/lib/time";
import { serializeTask } from "./api";
import { assistantConfigured } from "./brief";
import { addTask } from "./capture";
import { dueDate } from "./capture-text";
import { logContactEvent, setStage, trackBooking, noteToCrm } from "./contacts";
import { notify } from "./notifications";
import { parseRecap, RECAP_SYSTEM, type Recap } from "./recap-text";
import { getProfileByUser } from "./scheduling";
import { bookingNotes } from "./meeting-notes";
import { notesForRecap } from "./notes-text";
import { languageNames, renderTranscript } from "./transcript-text";
import { detectedLanguages, getTranscript } from "./transcripts";
import { emitEvent } from "./webhooks";

export async function getRecap(bookingId: string): Promise<MeetingRecap | null> {
  return (
    (await db().query.meetingRecaps.findFirst({
      where: eq(schema.meetingRecaps.bookingId, bookingId),
    })) ?? null
  );
}

export const recapOf = (r: MeetingRecap | null) => (r ? (r.recap as Recap) : null);

/**
 * Builds the recap from the transcript and the host's in-meeting notes (either may be missing,
 * not both) with the meeting's context (answers, contact, stage). Requires the assistant;
 * without it the host uses the transcript with manual capture.
 */
export async function generateRecap(
  ws: Workspace,
  booking: Booking,
  eventType: EventType | null,
): Promise<MeetingRecap | null> {
  if (!assistantConfigured()) return null;
  const [transcript, notes] = await Promise.all([getTranscript(booking.id), bookingNotes(booking)]);
  const said = transcript?.segments.length ? transcript : null;
  if (!said && !notes.length) return null;
  const contact = booking.contactId
    ? await db().query.contacts.findFirst({ where: eq(schema.contacts.id, booking.contactId) })
    : null;
  const host = await getProfileByUser(ws.id, booking.hostUserId);
  const languages = said ? detectedLanguages(said.segments) : [];
  const asked = (eventType?.questions ?? [])
    .map((q) => ({ label: q.label, answer: (booking.answers[q.id] ?? "").trim() }))
    .filter((q) => q.answer);
  const env = loadEnv();
  const model = env.ASSISTANT_MODEL || "claude-sonnet-5";
  const prompt = [
    `Meeting: ${eventType?.title ?? "Meeting"} on ${fmtDateTime(booking.startAt, host?.timezone ?? ws.timezone)}.`,
    `Consultant (me): ${host?.displayName ?? "the host"}. Client (them): ${booking.attendeeName}${contact?.company ? ` of ${contact.company}` : ""}. Contact stage today: ${contact?.stage ?? "lead"}.`,
    contact?.notes ? `Host's notes on the client: ${contact.notes}` : "",
    asked.length
      ? `What the client asked for when booking:\n${asked.map((a) => `- ${a.label}: ${a.answer}`).join("\n")}`
      : "Nothing specific was asked for when booking.",
    booking.brief ? `Pre-meeting briefing:\n${booking.brief}` : "",
    languages.length > 1
      ? `The call switched between ${languageNames(languages)} (each line is tagged with its language). Write the recap, follow-up and attendee recap in the language the consultant spoke most.`
      : languages.length === 1
        ? `The call was in ${languageNames(languages)}; write the recap, follow-up and attendee recap in that language.`
        : "",
    said
      ? `Transcript:\n${renderTranscript(said.segments, { host: host?.displayName ?? "Host", attendee: booking.attendeeName }).slice(0, 60000)}`
      : "There is no transcript of this call: work from the consultant's notes only.",
    notes.length
      ? `The consultant's own notes from the call (their words, timestamped on the transcript's clock):\n${notesForRecap(notes, said?.startedAt ?? null).slice(0, 20000)}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  let recap: Recap | null = null;
  try {
    const r = await generateText({ model: anthropic(model), system: RECAP_SYSTEM, prompt });
    recap = parseRecap(r.text);
  } catch (e) {
    console.error("[recap] model failed", e);
  }
  if (!recap) return null;
  const [row] = await db()
    .insert(schema.meetingRecaps)
    .values({
      workspaceId: ws.id,
      bookingId: booking.id,
      contactId: contact?.id ?? null,
      recap,
      model,
    })
    .onConflictDoUpdate({
      target: schema.meetingRecaps.bookingId,
      set: { recap, model, accepted: {}, reviewedAt: null },
    })
    .returning();
  const summaryLine = [
    recap.summary,
    recap.decisions.length ? `Decisions: ${recap.decisions.map((d) => d.text).join("; ")}` : "",
    recap.nextStep ? `Next: ${recap.nextStep}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  await trackBooking(ws, booking, "capture", summaryLine.slice(0, 500) || "Meeting recap ready", {
    recap: true,
    model,
  });
  if (contact)
    noteToCrm(
      ws,
      contact.id,
      `Meeting recap (${eventType?.title ?? "Meeting"}, ${fmtDateTime(booking.startAt, ws.timezone)}):\n${summaryLine}`,
    );
  emitEvent(ws.id, "meeting.captured", {
    bookingId: booking.id,
    contactId: contact?.id ?? null,
    recap,
    tasks: [],
  });
  return row ?? null;
}

/** Tells the host that a recap (or, without the assistant, a transcript) is waiting. */
export async function notifyRecapReady(
  ws: Workspace,
  booking: Booking,
  recap: MeetingRecap | null,
) {
  const host = await getProfileByUser(ws.id, booking.hostUserId);
  const link = `${adminBaseUrl(ws)}/admin/bookings/${booking.id}`;
  const r = recapOf(recap);
  const when = fmtDateTime(booking.startAt, host?.timezone ?? ws.timezone);
  const subject = r
    ? `Recap ready: ${booking.attendeeName}`
    : `Transcript ready: ${booking.attendeeName}`;
  const text = r
    ? `Your call with ${booking.attendeeName} (${when}):\n\n${r.summary}\n\n${r.actions.length ? `Action items:\n${r.actions.map((a) => `- ${a.owner === "them" ? `${booking.attendeeName}: ` : ""}${a.title}`).join("\n")}\n\n` : ""}${r.nextStep ? `Next step: ${r.nextStep}\n\n` : ""}Review and act with one click: ${link}`
    : `The transcript of your call with ${booking.attendeeName} (${when}) is ready. Review it and turn it into notes, tasks and a follow-up:\n\n${link}`;
  // Realtime first (ADR 0007): the email is the fallback when the host has no Bookly tab open.
  void notify(ws, booking.hostUserId, {
    kind: "recap.ready",
    title: subject,
    body: r ? r.summary.slice(0, 160) : when,
    link: `/admin/bookings/${booking.id}`,
    dedupeKey: `booking:${booking.id}:${r ? "recap" : "transcript"}`,
    bookingId: booking.id,
    text: `${subject}. ${link}`,
    email: { subject, text },
  });
}

/* ---------------- One-click actions ---------------- */

const ORIGIN = {
  notes: "From your notes",
  transcript: "From the transcript",
  both: "From your notes and the transcript",
} as const;

/** What a task made from an action item says about where it came from. */
export function taskOrigin(a: Recap["actions"][number]): string {
  return `${ORIGIN[a.source ?? "transcript"]} of the call.${a.quote ? `\n\n“${a.quote}”` : ""}`;
}

/** Creates tasks for the chosen action items (indexes); idempotent per item. */
export async function acceptRecapActions(
  ws: Workspace,
  booking: Booking,
  indexes: number[],
  /** The member accepting; the booking's host is notified when it is someone else. */
  actorId?: string,
): Promise<Task[]> {
  const row = await getRecap(booking.id);
  const recap = recapOf(row);
  if (!row || !recap) return [];
  const done: Record<string, string> = { ...(row.accepted.tasks ?? {}) };
  const created: Task[] = [];
  for (const i of indexes) {
    const a = recap.actions[i];
    if (!a || done[String(i)]) continue;
    const t = await addTask(ws.id, {
      userId: booking.hostUserId,
      title: a.owner === "them" ? `${booking.attendeeName}: ${a.title}` : a.title,
      contactId: booking.contactId,
      bookingId: booking.id,
      dueAt: dueDate(a.dueInDays),
      assignedBy: actorId ?? null,
      description: taskOrigin(a),
    });
    done[String(i)] = t.id;
    created.push(t);
  }
  await db()
    .update(schema.meetingRecaps)
    .set({ accepted: { ...row.accepted, tasks: done }, reviewedAt: row.reviewedAt ?? new Date() })
    .where(eq(schema.meetingRecaps.id, row.id));
  if (created.length && booking.contactId)
    await logContactEvent(
      ws.id,
      booking.contactId,
      "task",
      `${created.length} action item${created.length === 1 ? "" : "s"} from the recap: ${created.map((t) => t.title).join("; ")}`,
      { bookingId: booking.id, data: { tasks: created.map(serializeTask) } },
    );
  return created;
}

export async function applyRecapStage(ws: Workspace, booking: Booking) {
  const row = await getRecap(booking.id);
  const recap = recapOf(row);
  if (!row || !recap?.suggestedStage || !booking.contactId) return;
  await setStage(ws.id, booking.contactId, recap.suggestedStage, "recap");
  await db()
    .update(schema.meetingRecaps)
    .set({
      accepted: { ...row.accepted, stage: recap.suggestedStage },
      reviewedAt: row.reviewedAt ?? new Date(),
    })
    .where(eq(schema.meetingRecaps.id, row.id));
}

export async function markRecapReviewed(bookingId: string) {
  await db()
    .update(schema.meetingRecaps)
    .set({ reviewedAt: new Date() })
    .where(
      and(eq(schema.meetingRecaps.bookingId, bookingId), isNull(schema.meetingRecaps.reviewedAt)),
    );
}

export async function noteRecapEmail(bookingId: string, kind: "followUpAt" | "recapAt") {
  const row = await getRecap(bookingId);
  if (!row) return;
  await db()
    .update(schema.meetingRecaps)
    .set({
      accepted: { ...row.accepted, [kind]: new Date().toISOString() },
      reviewedAt: row.reviewedAt ?? new Date(),
    })
    .where(eq(schema.meetingRecaps.id, row.id));
}

/** Recaps nobody has looked at yet, for Home. */
export async function recapsToReview(
  workspaceId: string,
  hostUserId?: string,
  limit = 10,
  /** Who is looking: interview recaps only with their application (ADR 0005). */
  viewer: string | null = null,
) {
  const rows = await db()
    .select({ r: schema.meetingRecaps, b: schema.bookings, eventTitle: schema.eventTypes.title })
    .from(schema.meetingRecaps)
    .innerJoin(schema.bookings, eq(schema.bookings.id, schema.meetingRecaps.bookingId))
    .leftJoin(schema.eventTypes, eq(schema.eventTypes.id, schema.bookings.eventTypeId))
    .where(
      and(
        eq(schema.meetingRecaps.workspaceId, workspaceId),
        isNull(schema.meetingRecaps.reviewedAt),
        bookingsVisibleTo(viewer),
      ),
    )
    .orderBy(desc(schema.meetingRecaps.createdAt))
    .limit(limit * 3);
  return rows
    .filter((x) => !hostUserId || x.b.hostUserId === hostUserId)
    .slice(0, limit)
    .map((x) => ({ ...x.r, booking: x.b, eventTitle: x.eventTitle, recap: x.r.recap as Recap }));
}
