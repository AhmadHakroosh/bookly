import "server-only";
import { and, eq, isNull, lt, schema, sql } from "@bookly/db";
import type { Booking, MeetingNoteEntry, MeetingNotes, Workspace } from "@bookly/db/schema";
import { db } from "@/lib/db";
import { logContactEvent } from "./contacts";
import { hasFlag } from "./flags";
import { hasFeature } from "./limits";
import { cleanEntries, notesForTimeline } from "./notes-text";
import { getProfileByUser, listProfiles } from "./scheduling";

/*
 * In-meeting notes (0.20.0). On Bookly video, a member in the call (they join as the room's
 * owner) keeps private, timestamped notes and marks moments; the panel autosaves here. After
 * the call the notes are an input to the recap and its action items (server/recaps.ts) and are
 * posted once to the contact's timeline as a note; later edits update that same entry.
 * Gates: the `meeting_notes` flag and `meetingNotes` (Pro, where Bookly video starts).
 */

export async function notesOn(ws: Workspace) {
  return hasFeature(ws, "meetingNotes") && (await hasFlag(ws, "meeting_notes"));
}

/**
 * The booking behind a Bookly video room, when this user may keep notes in it: a member of its
 * workspace, on a plan and flag that have notes.
 */
export async function noteableRoom(
  room: string,
  userId: string,
): Promise<{ ws: Workspace; booking: Booking } | null> {
  if (!/^b-[a-z0-9]+$/.test(room)) return null;
  const [booking] = await db()
    .select()
    .from(schema.bookings)
    .where(
      and(
        eq(schema.bookings.meetingProvider, "daily"),
        sql`${schema.bookings.meetingRef} ->> 'room' = ${room}`,
      ),
    )
    .limit(1);
  if (!booking) return null;
  const ws = await db().query.workspaces.findFirst({
    where: eq(schema.workspaces.id, booking.workspaceId),
  });
  if (!ws || !(await notesOn(ws))) return null;
  const member = await db().query.members.findFirst({
    where: and(
      eq(schema.members.organizationId, ws.organizationId),
      eq(schema.members.userId, userId),
    ),
    columns: { id: true },
  });
  return member ? { ws, booking } : null;
}

export async function getNotes(bookingId: string, userId: string): Promise<MeetingNotes | null> {
  return (
    (await db().query.meetingNotes.findFirst({
      where: and(
        eq(schema.meetingNotes.bookingId, bookingId),
        eq(schema.meetingNotes.userId, userId),
      ),
    })) ?? null
  );
}

/**
 * Saves a member's notes for a booking (the whole list: the panel sends what it shows). Returns
 * whether the row is new, so the caller audits the first save only, not every autosave.
 */
export async function saveNotes(
  ws: Workspace,
  booking: Booking,
  userId: string,
  input: unknown,
): Promise<{ entries: MeetingNoteEntry[]; created: boolean }> {
  const entries = cleanEntries(input);
  const existing = await getNotes(booking.id, userId);
  if (!existing) {
    await db()
      .insert(schema.meetingNotes)
      .values({ workspaceId: ws.id, bookingId: booking.id, userId, entries })
      .onConflictDoUpdate({
        target: [schema.meetingNotes.bookingId, schema.meetingNotes.userId],
        set: { entries, updatedAt: new Date() },
      });
    return { entries, created: true };
  }
  await db()
    .update(schema.meetingNotes)
    .set({ entries, updatedAt: new Date() })
    .where(eq(schema.meetingNotes.id, existing.id));
  // Already on the timeline: keep that entry in step with the notes.
  if (existing.contactEventId) await updateTimelineNote(ws, booking, userId, existing, entries);
  return { entries, created: false };
}

/** Every member's notes for a booking with their names, for the recap. */
export async function bookingNotes(booking: Booking) {
  const [rows, people] = await Promise.all([
    db().select().from(schema.meetingNotes).where(eq(schema.meetingNotes.bookingId, booking.id)),
    listProfiles(booking.workspaceId),
  ]);
  const name = new Map(people.map((p) => [p.userId, p.displayName]));
  return rows
    .filter((r) => r.entries.length)
    .map((r) => ({ userId: r.userId, name: name.get(r.userId) ?? "Host", entries: r.entries }));
}

async function timelineText(ws: Workspace, userId: string, entries: MeetingNoteEntry[]) {
  const profile = await getProfileByUser(ws.id, userId);
  return {
    author: profile?.displayName ?? "Host",
    body: notesForTimeline(entries, profile?.timezone ?? ws.timezone),
  };
}

async function updateTimelineNote(
  ws: Workspace,
  booking: Booking,
  userId: string,
  row: MeetingNotes,
  entries: MeetingNoteEntry[],
) {
  const { author, body } = await timelineText(ws, userId, entries);
  await db()
    .update(schema.contactEvents)
    .set({
      data: { meetingNotes: true, bookingId: booking.id, userId, author, body },
    })
    .where(eq(schema.contactEvents.id, row.contactEventId!));
}

/**
 * From the reminders tick: notes of meetings that ended a while ago go onto the contact's
 * timeline (once). A booking with notes but no transcript gets a recap from the notes alone
 * when the assistant is configured, so the action items still appear.
 */
export async function postDueNotes(now = new Date()): Promise<number> {
  const rows = await db()
    .select({ n: schema.meetingNotes, b: schema.bookings })
    .from(schema.meetingNotes)
    .innerJoin(schema.bookings, eq(schema.bookings.id, schema.meetingNotes.bookingId))
    .where(
      and(
        isNull(schema.meetingNotes.postedAt),
        lt(schema.bookings.endAt, new Date(now.getTime() - 10 * 60_000)),
      ),
    )
    .limit(100);
  const recapFor = new Map<string, { ws: Workspace; booking: Booking }>();
  let posted = 0;
  for (const { n, b } of rows) {
    const ws = await db().query.workspaces.findFirst({
      where: eq(schema.workspaces.id, b.workspaceId),
    });
    if (!ws) continue;
    let contactEventId: string | null = null;
    if (b.contactId && n.entries.length) {
      const { author, body } = await timelineText(ws, n.userId, n.entries);
      contactEventId = crypto.randomUUID();
      await logContactEvent(ws.id, b.contactId, "note", `Notes from the call by ${author}`, {
        id: contactEventId,
        bookingId: b.id,
        data: { meetingNotes: true, bookingId: b.id, userId: n.userId, author, body },
      });
      posted++;
    }
    await db()
      .update(schema.meetingNotes)
      .set({ postedAt: now, contactEventId })
      .where(eq(schema.meetingNotes.id, n.id));
    if (n.entries.length && !b.transcriptStatus) recapFor.set(b.id, { ws, booking: b });
  }
  // Calls that were not transcribed: a recap from the notes, unless one exists already.
  for (const { ws, booking } of recapFor.values()) {
    const { assistantConfigured } = await import("./brief");
    if (!assistantConfigured()) break;
    const { generateRecap, getRecap, notifyRecapReady } = await import("./recaps");
    if (await getRecap(booking.id)) continue;
    const et = booking.eventTypeId
      ? await db().query.eventTypes.findFirst({
          where: eq(schema.eventTypes.id, booking.eventTypeId),
        })
      : null;
    const recap = await generateRecap(ws, booking, et ?? null).catch((e) => {
      console.error("[notes] recap failed", e);
      return null;
    });
    if (recap) await notifyRecapReady(ws, booking, recap);
  }
  return posted;
}
