import "server-only";
import { and, asc, count, eq, gte, inArray, isNull, lt, lte, or, schema, sql } from "@bookly/db";
import type { Workspace } from "@bookly/db/schema";
import { db } from "@/lib/db";
import { contactsVisibleTo } from "./access/hiring";
import { todayIn, zonedToUtc } from "@/lib/time";

/*
 * The numbers behind the Home cards. Each card asks for its own slice so it can stream in on
 * its own and fail on its own; everything is a count or a short top-N, never a whole list.
 * `hostUserId` scopes bookings to a member's own meetings (owners and admins see everyone's).
 */

export type HomeScope = { ws: Workspace; tz: string; hostUserId?: string };

const DAY = 86_400_000;

/** Monday 00:00 of the current week and the next Monday, in the viewer's timezone, as UTC. */
export function weekBounds(tz: string, now = new Date()) {
  const today = todayIn(tz, now);
  const [y, m, d] = today.split("-").map(Number) as [number, number, number];
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  const back = (weekday + 6) % 7;
  const monday = new Date(Date.UTC(y, m - 1, d - back)).toISOString().slice(0, 10);
  const start = zonedToUtc(monday, 0, tz);
  return { start, end: new Date(start.getTime() + 7 * DAY) };
}

/** The first of the month 00:00 in the viewer's timezone, as UTC. */
export function monthStart(tz: string, now = new Date()) {
  return zonedToUtc(`${todayIn(tz, now).slice(0, 7)}-01`, 0, tz);
}

const hostCond = (hostUserId?: string) =>
  hostUserId ? [eq(schema.bookings.hostUserId, hostUserId)] : [];

/** Confirmed meetings from now to the end of the week, with the next three. */
export async function upcomingThisWeek({ ws, tz, hostUserId }: HomeScope, now = new Date()) {
  const { end } = weekBounds(tz, now);
  const where = and(
    eq(schema.bookings.workspaceId, ws.id),
    inArray(schema.bookings.status, ["confirmed"]),
    gte(schema.bookings.startAt, now),
    lt(schema.bookings.startAt, end),
    ...hostCond(hostUserId),
  );
  const [total, next] = await Promise.all([
    db().select({ n: count() }).from(schema.bookings).where(where),
    db()
      .select({
        id: schema.bookings.id,
        startAt: schema.bookings.startAt,
        attendeeName: schema.bookings.attendeeName,
        title: schema.eventTypes.title,
      })
      .from(schema.bookings)
      .leftJoin(schema.eventTypes, eq(schema.eventTypes.id, schema.bookings.eventTypeId))
      .where(where)
      .orderBy(asc(schema.bookings.startAt))
      .limit(3),
  ]);
  return { total: total[0]?.n ?? 0, next };
}

/** Bookings made since the member last opened Home (any status, by creation time). */
export async function newSinceLastVisit({ ws, hostUserId }: HomeScope, since: Date | null) {
  if (!since) return { since: null, total: 0, cancelled: 0 };
  const base = [
    eq(schema.bookings.workspaceId, ws.id),
    gte(schema.bookings.createdAt, since),
    ...hostCond(hostUserId),
  ];
  const [made, cancelled] = await Promise.all([
    db()
      .select({ n: count() })
      .from(schema.bookings)
      .where(and(...base)),
    db()
      .select({ n: count() })
      .from(schema.bookings)
      .where(
        and(
          eq(schema.bookings.workspaceId, ws.id),
          eq(schema.bookings.status, "cancelled"),
          gte(schema.bookings.updatedAt, since),
          ...hostCond(hostUserId),
        ),
      ),
  ]);
  return { since, total: made[0]?.n ?? 0, cancelled: cancelled[0]?.n ?? 0 };
}

/** Paid booking payments recorded this month, summed per currency (refunds excluded). */
export async function paymentsThisMonth({ ws, tz }: HomeScope, now = new Date()) {
  const start = monthStart(tz, now);
  const rows = await db()
    .select({
      currency: schema.bookings.currency,
      cents: sql<number>`coalesce(sum(${schema.bookings.amountCents}), 0)::int`,
      n: count(),
    })
    .from(schema.bookings)
    .where(
      and(
        eq(schema.bookings.workspaceId, ws.id),
        eq(schema.bookings.paymentStatus, "paid"),
        // When the payment was recorded; older rows without it fall back to the update time.
        sql`coalesce((${schema.bookings.paymentRef}->>'paidAt')::timestamptz, ${schema.bookings.updatedAt}) >= ${start}`,
      ),
    )
    .groupBy(schema.bookings.currency);
  return rows
    .filter((r) => r.n > 0)
    .map((r) => ({ currency: r.currency ?? "usd", cents: r.cents, count: r.n }));
}

/** Contacts added this week and follow-ups that are due. */
export async function contactsSummary({ ws, tz }: HomeScope, now = new Date()) {
  const { start } = weekBounds(tz, now);
  const [added, due] = await Promise.all([
    db()
      .select({ n: count() })
      .from(schema.contacts)
      .where(
        and(
          eq(schema.contacts.workspaceId, ws.id),
          gte(schema.contacts.createdAt, start),
          contactsVisibleTo(null),
        ),
      ),
    db()
      .select({ n: count() })
      .from(schema.contacts)
      .where(
        and(
          eq(schema.contacts.workspaceId, ws.id),
          lte(schema.contacts.nextFollowUpAt, now),
          contactsVisibleTo(null),
        ),
      ),
  ]);
  return { addedThisWeek: added[0]?.n ?? 0, followUpsDue: due[0]?.n ?? 0 };
}

/** What is waiting on the host: requests to accept, recaps to review, people gone quiet. */
export async function needsAttention({ ws, hostUserId }: HomeScope, now = new Date()) {
  const quietCutoff = new Date(now.getTime() - 7 * DAY);
  const [pending, recaps, stale] = await Promise.all([
    db()
      .select({ n: count() })
      .from(schema.bookings)
      .where(
        and(
          eq(schema.bookings.workspaceId, ws.id),
          eq(schema.bookings.status, "pending"),
          gte(schema.bookings.startAt, now),
          ...hostCond(hostUserId),
        ),
      ),
    db()
      .select({ n: count() })
      .from(schema.meetingRecaps)
      .innerJoin(schema.bookings, eq(schema.bookings.id, schema.meetingRecaps.bookingId))
      .where(
        and(
          eq(schema.meetingRecaps.workspaceId, ws.id),
          isNull(schema.meetingRecaps.reviewedAt),
          ...hostCond(hostUserId),
        ),
      ),
    db()
      .select({ n: count() })
      .from(schema.contacts)
      .where(
        and(
          eq(schema.contacts.workspaceId, ws.id),
          or(
            lte(schema.contacts.nextFollowUpAt, now),
            and(
              // Lazy: contacts.ts pulls in the app; Home's date helpers stay importable alone.
              await (await import("./contacts")).inEntryStage(ws.id),
              lte(schema.contacts.lastActivityAt, quietCutoff),
            ),
          ),
        ),
      ),
  ]);
  return {
    requests: pending[0]?.n ?? 0,
    recaps: recaps[0]?.n ?? 0,
    followUps: stale[0]?.n ?? 0,
  };
}

/** The member's open tasks: how many, due today, overdue; managers also see the team's open count. */
export async function tasksSummary(
  { ws, tz }: HomeScope,
  userId: string,
  manager: boolean,
  now = new Date(),
) {
  const endOfToday = zonedToUtc(todayIn(tz, now), 24 * 60 - 1, tz);
  const open = and(eq(schema.tasks.workspaceId, ws.id), isNull(schema.tasks.doneAt));
  const mine = and(open, eq(schema.tasks.userId, userId));
  const [openMine, overdue, dueToday, team] = await Promise.all([
    db().select({ n: count() }).from(schema.tasks).where(mine),
    db()
      .select({ n: count() })
      .from(schema.tasks)
      .where(and(mine, lt(schema.tasks.dueAt, now))),
    db()
      .select({ n: count() })
      .from(schema.tasks)
      .where(and(mine, gte(schema.tasks.dueAt, now), lte(schema.tasks.dueAt, endOfToday))),
    manager
      ? db().select({ n: count() }).from(schema.tasks).where(open)
      : Promise.resolve([{ n: 0 }]),
  ]);
  return {
    open: openMine[0]?.n ?? 0,
    overdue: overdue[0]?.n ?? 0,
    dueToday: dueToday[0]?.n ?? 0,
    team: manager ? (team[0]?.n ?? 0) : null,
  };
}

/* ---------------- Last visit ---------------- */

/** How long one visit lasts: reloading Home within it keeps the same "since" point. */
export const VISIT_WINDOW_MS = 30 * 60_000;

export async function lastHomeVisit(wsId: string, userId: string): Promise<Date | null> {
  const row = await db().query.homeVisits.findFirst({
    where: and(eq(schema.homeVisits.workspaceId, wsId), eq(schema.homeVisits.userId, userId)),
  });
  return row?.seenAt ?? null;
}

/**
 * Records this visit, unless the last one is still within the visit window (so a reload or a
 * quick back-and-forth does not reset "new since your last visit" to zero).
 */
export async function recordHomeVisit(wsId: string, userId: string, now = new Date()) {
  await db()
    .insert(schema.homeVisits)
    .values({ workspaceId: wsId, userId, seenAt: now })
    .onConflictDoUpdate({
      target: [schema.homeVisits.workspaceId, schema.homeVisits.userId],
      set: { seenAt: now },
      setWhere: lt(schema.homeVisits.seenAt, new Date(now.getTime() - VISIT_WINDOW_MS)),
    });
}
