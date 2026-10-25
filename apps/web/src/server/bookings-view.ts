import "server-only";
import { and, asc, desc, eq, gt, gte, lt, lte, or, schema, sql } from "@bookly/db";
import type { Booking } from "@bookly/db/schema";
import { db } from "@/lib/db";
import { bookingsVisibleTo, redactInterview } from "./access/hiring";

/*
 * Bookings for the list and calendar views: each row carries its event type's title, seats and
 * colour, the contact's company and the host's display name, so the views can tint, group and
 * filter without more queries. The list is keyset-paginated on (start_at, id); the calendar
 * reads one date range at a time.
 */

export type ViewBooking = Booking & {
  eventTitle: string | null;
  eventSeats: number | null;
  eventColor: string | null;
  contactCompany: string | null;
  hostName: string | null;
};

const select = {
  b: schema.bookings,
  eventTitle: schema.eventTypes.title,
  eventSeats: schema.eventTypes.seats,
  eventColor: schema.eventTypes.color,
  contactCompany: schema.contacts.company,
  hostName: schema.profiles.displayName,
};

/** The row query; `viewer` decides which interviews are shown in full (ADR 0005). */
function base(viewer: string | null) {
  return db()
    .select({ ...select, hidden: sql<boolean>`not ${bookingsVisibleTo(viewer)}` })
    .from(schema.bookings)
    .leftJoin(schema.eventTypes, eq(schema.eventTypes.id, schema.bookings.eventTypeId))
    .leftJoin(schema.contacts, eq(schema.contacts.id, schema.bookings.contactId))
    .leftJoin(
      schema.profiles,
      and(
        eq(schema.profiles.workspaceId, schema.bookings.workspaceId),
        eq(schema.profiles.userId, schema.bookings.hostUserId),
      ),
    );
}

const flatten = (r: {
  b: Booking;
  eventTitle: string | null;
  eventSeats: number | null;
  eventColor: string | null;
  contactCompany: string | null;
  hostName: string | null;
  hidden: boolean;
}): ViewBooking => {
  const row: ViewBooking = {
    ...r.b,
    eventTitle: r.eventTitle,
    eventSeats: r.eventSeats,
    eventColor: r.eventColor,
    contactCompany: r.contactCompany,
    hostName: r.hostName,
  };
  return r.hidden ? { ...redactInterview(row), eventTitle: "Interview" } : row;
};

export type ListCursor = { startAt: string; id: string };

export const encodeListCursor = (b: Pick<Booking, "startAt" | "id">) =>
  Buffer.from(`${b.startAt.toISOString()}|${b.id}`).toString("base64url");

export function decodeListCursor(s: unknown): ListCursor | null {
  if (typeof s !== "string" || !s) return null;
  try {
    const [startAt, id] = Buffer.from(s, "base64url").toString().split("|");
    if (!startAt || !id || Number.isNaN(Date.parse(startAt))) return null;
    return { startAt, id };
  } catch {
    return null;
  }
}

/**
 * One page of the list: upcoming in start order, past newest first. The page after `cursor`
 * costs the same however many bookings the workspace has.
 */
export async function listBookingsPage(
  workspaceId: string,
  opts: {
    past: boolean;
    hostUserId?: string;
    cursor?: ListCursor | null;
    limit?: number;
    now?: Date;
    /** Who is looking; interviews they may not see show as "Interview" (ADR 0005). */
    viewer?: string | null;
    /** Only requests waiting for the host to confirm. */
    pendingOnly?: boolean;
  },
): Promise<{ rows: ViewBooking[]; next: string | null }> {
  const now = opts.now ?? new Date();
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const conds = [
    eq(schema.bookings.workspaceId, workspaceId),
    opts.past ? lte(schema.bookings.endAt, now) : gte(schema.bookings.endAt, now),
  ];
  if (opts.hostUserId) conds.push(eq(schema.bookings.hostUserId, opts.hostUserId));
  if (opts.pendingOnly) conds.push(eq(schema.bookings.status, "pending"));
  if (opts.cursor) {
    const at = new Date(opts.cursor.startAt);
    const before = opts.past;
    conds.push(
      or(
        before ? lt(schema.bookings.startAt, at) : gt(schema.bookings.startAt, at),
        and(
          eq(schema.bookings.startAt, at),
          before ? lt(schema.bookings.id, opts.cursor.id) : gt(schema.bookings.id, opts.cursor.id),
        ),
      )!,
    );
  }
  const rows = await base(opts.viewer ?? null)
    .where(and(...conds))
    .orderBy(
      opts.past ? desc(schema.bookings.startAt) : asc(schema.bookings.startAt),
      opts.past ? desc(schema.bookings.id) : asc(schema.bookings.id),
    )
    .limit(limit + 1);
  const more = rows.length > limit;
  const page = (more ? rows.slice(0, limit) : rows).map(flatten);
  return { rows: page, next: more ? encodeListCursor(page[page.length - 1]!) : null };
}

/** The most a calendar range shows; a month of a busy team stays well under it. */
export const RANGE_CAP = 600;

/** Bookings that overlap [from, to), cancelled and rescheduled ones left out. */
export async function listBookingsRange(
  workspaceId: string,
  opts: { from: Date; to: Date; hostUserId?: string; viewer?: string | null },
): Promise<{ rows: ViewBooking[]; capped: boolean }> {
  const conds = [
    eq(schema.bookings.workspaceId, workspaceId),
    lt(schema.bookings.startAt, opts.to),
    gt(schema.bookings.endAt, opts.from),
    sql`${schema.bookings.status} not in ('cancelled', 'rescheduled')`,
  ];
  if (opts.hostUserId) conds.push(eq(schema.bookings.hostUserId, opts.hostUserId));
  const rows = await base(opts.viewer ?? null)
    .where(and(...conds))
    .orderBy(asc(schema.bookings.startAt), asc(schema.bookings.id))
    .limit(RANGE_CAP + 1);
  return { rows: rows.slice(0, RANGE_CAP).map(flatten), capped: rows.length > RANGE_CAP };
}

/** Event types in a set of bookings with their colour and how many bookings each has. */
export function legendOf(rows: ViewBooking[]) {
  const by = new Map<string, { title: string; color: string; count: number }>();
  for (const b of rows) {
    const key = b.eventTypeId ?? "none";
    const cur = by.get(key) ?? {
      title: b.eventTitle ?? "Other",
      color: b.eventColor ?? FALLBACK_COLOR,
      count: 0,
    };
    cur.count++;
    by.set(key, cur);
  }
  return [...by.values()].sort((a, b) => b.count - a.count || a.title.localeCompare(b.title));
}

export const FALLBACK_COLOR = "#71717a";

/** A safe CSS colour from the stored value (it is validated on save, but never trust it here). */
export const safeColor = (c: string | null | undefined) =>
  c && /^#[0-9a-f]{6}$/i.test(c) ? c : FALLBACK_COLOR;

/** How many requests wait for the host to confirm (the Requests tab's count). */
export async function countRequests(workspaceId: string, hostUserId?: string, now = new Date()) {
  const [row] = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.bookings)
    .where(
      and(
        eq(schema.bookings.workspaceId, workspaceId),
        eq(schema.bookings.status, "pending"),
        gte(schema.bookings.endAt, now),
        hostUserId ? eq(schema.bookings.hostUserId, hostUserId) : undefined,
      ),
    );
  return row?.n ?? 0;
}
