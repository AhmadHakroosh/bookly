import "server-only";
import { anthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import { and, asc, eq, schema } from "@bookly/db";
import { loadEnv } from "@bookly/config";
import type { Booking, EventType, Workspace } from "@bookly/db/schema";
import { db } from "@/lib/db";
import { BRIEF_SYSTEM, factsForModel, plainBrief, type BriefFacts } from "./brief-text";
import { listOpenTasks } from "./capture";
import { contactTimeline, logContactEvent, trackBooking } from "./contacts";
import { getProfileByUser } from "./scheduling";

export const assistantConfigured = () => !!loadEnv().ANTHROPIC_API_KEY;

async function gatherFacts(
  workspace: Workspace,
  booking: Booking,
  eventType: EventType | null,
): Promise<BriefFacts> {
  const contact = booking.contactId
    ? await db().query.contacts.findFirst({ where: eq(schema.contacts.id, booking.contactId) })
    : null;
  const c =
    contact ??
    (await trackBooking(workspace, booking, "booked", `Booked ${eventType?.title ?? "meeting"}`));
  const [timeline, previous, host, openTasks] = await Promise.all([
    contactTimeline(c.id, 40),
    db()
      .select({
        startAt: schema.bookings.startAt,
        status: schema.bookings.status,
        title: schema.eventTypes.title,
      })
      .from(schema.bookings)
      .leftJoin(schema.eventTypes, eq(schema.eventTypes.id, schema.bookings.eventTypeId))
      .where(
        and(eq(schema.bookings.contactId, c.id), eq(schema.bookings.workspaceId, workspace.id)),
      )
      .orderBy(asc(schema.bookings.startAt)),
    getProfileByUser(workspace.id, booking.hostUserId),
    listOpenTasks(workspace.id, { contactId: c.id, limit: 10 }),
  ]);
  const questions = (eventType?.questions ?? [])
    .map((q) => ({ label: q.label, answer: (booking.answers[q.id] ?? "").trim() }))
    .filter((q) => q.answer);
  return {
    tz: host?.timezone ?? workspace.timezone,
    booking,
    eventTitle: eventType?.title ?? "Meeting",
    questions,
    contact: c,
    timeline: timeline.filter((e) => e.bookingId !== booking.id || e.type !== "booked"),
    openTasks: openTasks.map((t) => t.title),
    previousMeetings: previous
      .filter((p) => p.startAt.getTime() !== booking.startAt.getTime())
      .map((p) => ({ title: p.title ?? "Meeting", startAt: p.startAt, status: p.status })),
  };
}

/**
 * The host's briefing for a booking. Stored on the booking; regenerated on demand or when
 * older than a day. Uses the model when configured, otherwise a deterministic summary.
 */
export async function briefForBooking(
  workspace: Workspace,
  booking: Booking,
  eventType: EventType | null,
  opts: { force?: boolean } = {},
): Promise<string> {
  const fresh =
    booking.brief && booking.briefAt && Date.now() - booking.briefAt.getTime() < 86_400_000;
  if (fresh && !opts.force) return booking.brief!;
  const facts = await gatherFacts(workspace, booking, eventType);
  let text = plainBrief(facts);
  let model: string | null = null;
  if (assistantConfigured()) {
    try {
      const env = loadEnv();
      const r = await generateText({
        model: anthropic(env.ASSISTANT_MODEL || "claude-sonnet-5"),
        system: BRIEF_SYSTEM,
        prompt: factsForModel(facts),
      });
      if (r.text.trim()) {
        text = r.text.trim();
        model = env.ASSISTANT_MODEL || "claude-sonnet-5";
      }
    } catch (e) {
      console.error("[brief] model failed, using plain brief", e);
    }
  }
  await db()
    .update(schema.bookings)
    .set({ brief: text, briefAt: new Date() })
    .where(eq(schema.bookings.id, booking.id));
  if (facts.contact && "id" in facts.contact)
    await logContactEvent(
      workspace.id,
      (facts.contact as { id: string }).id,
      "brief",
      `Briefing prepared for ${facts.eventTitle}`,
      {
        bookingId: booking.id,
        data: { model },
      },
    );
  return text;
}
