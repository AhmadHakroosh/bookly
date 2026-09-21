import "server-only";
import { anthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import { and, desc, eq, isNull, schema } from "@bookly/db";
import { loadEnv } from "@bookly/config";
import type { Booking, EventType, MeetingRecap, Task, Workspace } from "@bookly/db/schema";
import { sendEmail } from "@bookly/email";
import { db } from "@/lib/db";
import { fmtDateTime } from "@/lib/time";
import { serializeTask } from "./api";
import { assistantConfigured } from "./brief";
import { addTask } from "./capture";
import { dueDate } from "./capture-text";
import { logContactEvent, setStage, trackBooking } from "./contacts";
import { pushNote } from "./crm";
import { notifyHost } from "./notify";
import { parseRecap, RECAP_SYSTEM, type Recap } from "./recap-text";
import { baseUrl, getProfileByUser } from "./scheduling";
import { renderTranscript } from "./transcript-text";
import { getTranscript } from "./transcripts";
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
 * Builds the recap from the transcript with the meeting's context (answers, contact, stage).
 * Requires the assistant; without it the host uses the transcript with manual capture.
 */
export async function generateRecap(
  ws: Workspace,
  booking: Booking,
  eventType: EventType | null,
): Promise<MeetingRecap | null> {
  if (!assistantConfigured()) return null;
  const transcript = await getTranscript(booking.id);
  if (!transcript || !transcript.segments.length) return null;
  const contact = booking.contactId
    ? await db().query.contacts.findFirst({ where: eq(schema.contacts.id, booking.contactId) })
    : null;
  const host = await getProfileByUser(ws.id, booking.hostUserId);
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
    `Transcript:\n${renderTranscript(transcript.segments, { host: host?.displayName ?? "Host", attendee: booking.attendeeName }).slice(0, 60000)}`,
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
    void pushNote(
      ws,
      contact,
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

/** Emails the host that a recap (or, without the assistant, a transcript) is waiting. */
export async function notifyRecapReady(
  ws: Workspace,
  booking: Booking,
  recap: MeetingRecap | null,
) {
  const [host, user] = await Promise.all([
    getProfileByUser(ws.id, booking.hostUserId),
    db().query.users.findFirst({
      where: eq(schema.users.id, booking.hostUserId),
      columns: { email: true },
    }),
  ]);
  const link = `${baseUrl()}/admin/bookings/${booking.id}`;
  const r = recapOf(recap);
  const when = fmtDateTime(booking.startAt, host?.timezone ?? ws.timezone);
  const subject = r
    ? `Recap ready: ${booking.attendeeName}`
    : `Transcript ready: ${booking.attendeeName}`;
  const text = r
    ? `Your call with ${booking.attendeeName} (${when}):\n\n${r.summary}\n\n${r.actions.length ? `Action items:\n${r.actions.map((a) => `- ${a.owner === "them" ? `${booking.attendeeName}: ` : ""}${a.title}`).join("\n")}\n\n` : ""}${r.nextStep ? `Next step: ${r.nextStep}\n\n` : ""}Review and act with one click: ${link}`
    : `The transcript of your call with ${booking.attendeeName} (${when}) is ready. Review it and turn it into notes, tasks and a follow-up:\n\n${link}`;
  if (user?.email) await sendEmail({ to: user.email, subject, text }).catch(() => {});
  void notifyHost(booking.hostUserId, "onBooking", { subject, text: `${subject}. ${link}` });
}

/* ---------------- One-click actions ---------------- */

/** Creates tasks for the chosen action items (indexes); idempotent per item. */
export async function acceptRecapActions(
  ws: Workspace,
  booking: Booking,
  indexes: number[],
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

/** Recaps nobody has looked at yet, for the inbox. */
export async function recapsToReview(workspaceId: string, hostUserId?: string, limit = 10) {
  const rows = await db()
    .select({ r: schema.meetingRecaps, b: schema.bookings, eventTitle: schema.eventTypes.title })
    .from(schema.meetingRecaps)
    .innerJoin(schema.bookings, eq(schema.bookings.id, schema.meetingRecaps.bookingId))
    .leftJoin(schema.eventTypes, eq(schema.eventTypes.id, schema.bookings.eventTypeId))
    .where(
      and(
        eq(schema.meetingRecaps.workspaceId, workspaceId),
        isNull(schema.meetingRecaps.reviewedAt),
      ),
    )
    .orderBy(desc(schema.meetingRecaps.createdAt))
    .limit(limit * 3);
  return rows
    .filter((x) => !hostUserId || x.b.hostUserId === hostUserId)
    .slice(0, limit)
    .map((x) => ({ ...x.r, booking: x.b, eventTitle: x.eventTitle, recap: x.r.recap as Recap }));
}
