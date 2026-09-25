import "server-only";
import { and, asc, eq, inArray, schema, sql } from "@bookly/db";
import type { Booking, EventType } from "@bookly/db/schema";
import { db } from "@/lib/db";

/**
 * Group sessions: an event type with more than one seat is booked once per attendee, and the
 * bookings that share an event type, host and start form one session. These helpers give both
 * sides the numbers: seats taken, people waiting, and (for the host) who is in the room.
 */

const ACTIVE = ["confirmed", "pending"] as const;

export type SessionRef = Pick<Booking, "eventTypeId" | "hostUserId" | "startAt">;

export const sessionKey = (b: SessionRef) =>
  `${b.eventTypeId}|${b.hostUserId}|${b.startAt.toISOString()}`;

export type SessionAttendee = {
  id: string;
  name: string;
  email: string;
  company: string | null;
  status: string;
  contactId: string | null;
};

/** Everyone booked into the session (confirmed or pending), in booking order. */
export async function sessionAttendees(ref: SessionRef): Promise<SessionAttendee[]> {
  if (!ref.eventTypeId) return [];
  const rows = await db()
    .select({ b: schema.bookings, company: schema.contacts.company })
    .from(schema.bookings)
    .leftJoin(schema.contacts, eq(schema.contacts.id, schema.bookings.contactId))
    .where(
      and(
        eq(schema.bookings.eventTypeId, ref.eventTypeId),
        eq(schema.bookings.hostUserId, ref.hostUserId),
        eq(schema.bookings.startAt, ref.startAt),
        inArray(schema.bookings.status, [...ACTIVE]),
      ),
    )
    .orderBy(asc(schema.bookings.createdAt));
  return rows.map((r) => ({
    id: r.b.id,
    name: r.b.attendeeName,
    email: r.b.attendeeEmail,
    company: r.company ?? null,
    status: r.b.status,
    contactId: r.b.contactId,
  }));
}

/** People waiting for each of the given session starts (ms epoch → count). */
export async function waitingCounts(
  eventTypeId: string,
  starts: Date[],
): Promise<Map<number, number>> {
  if (!starts.length) return new Map();
  const rows = await db()
    .select({ startAt: schema.waitlistEntries.startAt, count: sql<number>`count(*)::int` })
    .from(schema.waitlistEntries)
    .where(
      and(
        eq(schema.waitlistEntries.eventTypeId, eventTypeId),
        eq(schema.waitlistEntries.status, "waiting"),
        inArray(schema.waitlistEntries.startAt, starts),
      ),
    )
    .groupBy(schema.waitlistEntries.startAt);
  return new Map(rows.filter((r) => r.startAt).map((r) => [r.startAt!.getTime(), r.count]));
}

export type SessionSummary = {
  seats: number;
  taken: number;
  waiting: number;
  attendees: SessionAttendee[];
};

/** The numbers for the session a booking belongs to; null for one-to-one event types. */
export async function sessionSummary(
  b: Booking,
  et: EventType | null,
): Promise<SessionSummary | null> {
  if (!et || et.seats <= 1) return null;
  const [attendees, waiting] = await Promise.all([
    sessionAttendees(b),
    waitingCounts(et.id, [b.startAt]),
  ]);
  return {
    seats: et.seats,
    taken: attendees.length,
    waiting: waiting.get(b.startAt.getTime()) ?? 0,
    attendees,
  };
}

export type SessionRow = SessionRef & { id: string; status: string; eventSeats: number | null };

export type BookingGroup<T extends SessionRow> =
  | { kind: "single"; booking: T }
  | { kind: "session"; key: string; seats: number; taken: number; bookings: T[] };

/**
 * Bookings for the admin list, with the bookings of one group session folded into one item.
 * Order follows the first booking of each session; `taken` counts confirmed and pending seats.
 */
export function groupSessions<T extends SessionRow>(rows: T[]): BookingGroup<T>[] {
  const out: BookingGroup<T>[] = [];
  const byKey = new Map<string, Extract<BookingGroup<T>, { kind: "session" }>>();
  for (const b of rows) {
    const seats = b.eventSeats ?? 1;
    if (seats <= 1) {
      out.push({ kind: "single", booking: b });
      continue;
    }
    const key = sessionKey(b);
    let g = byKey.get(key);
    if (!g) {
      g = { kind: "session", key, seats, taken: 0, bookings: [] };
      byKey.set(key, g);
      out.push(g);
    }
    g.bookings.push(b);
    if ((ACTIVE as readonly string[]).includes(b.status)) g.taken += 1;
  }
  return out;
}
