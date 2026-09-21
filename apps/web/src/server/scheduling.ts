import "server-only";
import { createHash } from "node:crypto";
import { cacheLife, cacheTag } from "next/cache";
import { and, asc, desc, eq, gte, inArray, lte, schema, sql } from "@bookly/db";
import type {
  Booking,
  EventType,
  Profile,
  Schedule,
  ScheduleOverride,
  ScheduleRule,
  Workspace,
} from "@bookly/db/schema";
import { loadEnv } from "@bookly/config";
import { db } from "@/lib/db";
import { addDays } from "@/lib/time";
import { computeSlots, isSlotAvailable, type Interval } from "./availability/engine";
import { workspaceTag } from "./cache";

export const baseUrl = () => loadEnv().APP_URL.replace(/\/$/, "");
export const newToken = () =>
  createHash("sha256").update(crypto.randomUUID()).digest("base64url").slice(0, 40);

/* ---------------- Profiles ---------------- */

export async function getProfileByUsername(
  workspaceId: string,
  username: string,
): Promise<Profile | null> {
  "use cache";
  cacheTag(workspaceTag(workspaceId));
  cacheLife("hours");
  return (
    (await db().query.profiles.findFirst({
      where: and(
        eq(schema.profiles.workspaceId, workspaceId),
        eq(schema.profiles.username, username.toLowerCase()),
      ),
    })) ?? null
  );
}

export async function getProfileByUser(
  workspaceId: string,
  userId: string,
): Promise<Profile | null> {
  return (
    (await db().query.profiles.findFirst({
      where: and(eq(schema.profiles.workspaceId, workspaceId), eq(schema.profiles.userId, userId)),
    })) ?? null
  );
}

export async function listProfiles(workspaceId: string): Promise<Profile[]> {
  "use cache";
  cacheTag(workspaceTag(workspaceId));
  cacheLife("hours");
  return db()
    .select()
    .from(schema.profiles)
    .where(eq(schema.profiles.workspaceId, workspaceId))
    .orderBy(asc(schema.profiles.displayName));
}

/* ---------------- Schedules ---------------- */

export type ScheduleWithRules = Schedule & { rules: ScheduleRule[]; overrides: ScheduleOverride[] };

export async function getSchedule(id: string): Promise<ScheduleWithRules | null> {
  const s = await db().query.schedules.findFirst({ where: eq(schema.schedules.id, id) });
  if (!s) return null;
  const [rules, overrides] = await Promise.all([
    db()
      .select()
      .from(schema.scheduleRules)
      .where(eq(schema.scheduleRules.scheduleId, id))
      .orderBy(asc(schema.scheduleRules.weekday), asc(schema.scheduleRules.startMin)),
    db()
      .select()
      .from(schema.scheduleOverrides)
      .where(eq(schema.scheduleOverrides.scheduleId, id))
      .orderBy(asc(schema.scheduleOverrides.date)),
  ]);
  return { ...s, rules, overrides };
}

export async function listSchedules(workspaceId: string, userId: string): Promise<Schedule[]> {
  return db()
    .select()
    .from(schema.schedules)
    .where(and(eq(schema.schedules.workspaceId, workspaceId), eq(schema.schedules.userId, userId)))
    .orderBy(desc(schema.schedules.isDefault), asc(schema.schedules.name));
}

/** Creates a Mon–Fri 9–17 default schedule for a user if they have none. */
export async function ensureDefaultSchedule(
  workspaceId: string,
  userId: string,
  timezone: string,
): Promise<Schedule> {
  const existing = await db().query.schedules.findFirst({
    where: and(
      eq(schema.schedules.workspaceId, workspaceId),
      eq(schema.schedules.userId, userId),
      eq(schema.schedules.isDefault, true),
    ),
  });
  if (existing) return existing;
  const [s] = await db()
    .insert(schema.schedules)
    .values({ workspaceId, userId, name: "Working hours", timezone, isDefault: true })
    .returning();
  await db()
    .insert(schema.scheduleRules)
    .values(
      [1, 2, 3, 4, 5].map((weekday) => ({
        scheduleId: s!.id,
        weekday,
        startMin: 9 * 60,
        endMin: 17 * 60,
      })),
    );
  return s!;
}

/* ---------------- Event types ---------------- */

export async function listEventTypes(
  workspaceId: string,
  userId?: string,
  opts: { includeHidden?: boolean } = {},
): Promise<EventType[]> {
  const conds = [
    eq(schema.eventTypes.workspaceId, workspaceId),
    eq(schema.eventTypes.active, true),
  ];
  if (userId) conds.push(eq(schema.eventTypes.userId, userId));
  if (!opts.includeHidden) conds.push(eq(schema.eventTypes.hidden, false));
  return db()
    .select()
    .from(schema.eventTypes)
    .where(and(...conds))
    .orderBy(asc(schema.eventTypes.position), asc(schema.eventTypes.createdAt));
}

export async function listAllEventTypes(workspaceId: string): Promise<EventType[]> {
  return db()
    .select()
    .from(schema.eventTypes)
    .where(eq(schema.eventTypes.workspaceId, workspaceId))
    .orderBy(asc(schema.eventTypes.position), asc(schema.eventTypes.createdAt));
}

export async function getEventType(
  workspaceId: string,
  userId: string,
  slug: string,
): Promise<EventType | null> {
  "use cache";
  cacheTag(workspaceTag(workspaceId));
  cacheLife("hours");
  return (
    (await db().query.eventTypes.findFirst({
      where: and(
        eq(schema.eventTypes.workspaceId, workspaceId),
        eq(schema.eventTypes.userId, userId),
        eq(schema.eventTypes.slug, slug),
        eq(schema.eventTypes.active, true),
      ),
    })) ?? null
  );
}

export async function getEventTypeById(workspaceId: string, id: string): Promise<EventType | null> {
  return (
    (await db().query.eventTypes.findFirst({
      where: and(eq(schema.eventTypes.workspaceId, workspaceId), eq(schema.eventTypes.id, id)),
    })) ?? null
  );
}

/* ---------------- Availability (DB-backed) ---------------- */

/** Host's booked intervals in a range (all event types), for the engine's `busy` input. */
export async function hostBusy(hostUserId: string, from: Date, to: Date): Promise<Interval[]> {
  const rows = await db()
    .select({ start: schema.bookings.startAt, end: schema.bookings.endAt })
    .from(schema.bookings)
    .where(
      and(
        eq(schema.bookings.hostUserId, hostUserId),
        inArray(schema.bookings.status, ["confirmed", "pending"]),
        lte(schema.bookings.startAt, to),
        gte(schema.bookings.endAt, from),
      ),
    );
  return rows;
}

/** Busy time from connected calendars (Google / Outlook); fails open when a provider errors. */
export async function externalBusy(hostUserId: string, from: Date, to: Date): Promise<Interval[]> {
  const { externalBusy: fromIntegrations } = await import("./integrations");
  return fromIntegrations(hostUserId, from, to);
}

/** Everyone who can host this event type: the owner plus, for team types, the extra hosts. */
export function eventHosts(eventType: EventType): string[] {
  if (eventType.assignment === "single") return [eventType.userId];
  return [...new Set([eventType.userId, ...eventType.hostUserIds])];
}

async function hostSchedule(eventType: EventType, hostUserId: string) {
  const own = hostUserId === eventType.userId && eventType.scheduleId;
  const s = own ? await getSchedule(eventType.scheduleId!) : null;
  return (
    s ??
    (await getSchedule((await ensureDefaultSchedule(eventType.workspaceId, hostUserId, "UTC")).id))!
  );
}

async function allBusy(hostUserId: string, rangeStart: Date, rangeEnd: Date) {
  const [busy, ext] = await Promise.all([
    hostBusy(hostUserId, rangeStart, rangeEnd),
    externalBusy(hostUserId, rangeStart, rangeEnd),
  ]);
  return [...busy, ...ext];
}

/**
 * Engine input for one host. Collective event types fold every host's busy time into the
 * owner's schedule so only times when the whole team is free remain.
 */
async function engineInput(
  eventType: EventType,
  attendeeTz: string,
  from: string,
  to: string,
  hostUserId: string = eventType.userId,
) {
  const fallback = await hostSchedule(eventType, hostUserId);
  const rangeStart = new Date(`${addDays(from, -2)}T00:00:00Z`);
  const rangeEnd = new Date(`${addDays(to, 2)}T23:59:59Z`);
  const hosts = eventType.assignment === "collective" ? eventHosts(eventType) : [hostUserId];
  const busyAll = (await Promise.all(hosts.map((h) => allBusy(h, rangeStart, rangeEnd)))).flat();
  return {
    scheduleTz: fallback.timezone,
    rules: fallback.rules,
    overrides: fallback.overrides,
    durationMin: eventType.durationMin,
    slotIntervalMin: eventType.slotIntervalMin,
    bufferBeforeMin: eventType.bufferBeforeMin,
    bufferAfterMin: eventType.bufferAfterMin,
    minNoticeMin: eventType.minNoticeMin,
    maxDaysAhead: eventType.maxDaysAhead,
    maxPerDay: eventType.maxPerDay,
    busy: busyAll,
    attendeeTz,
  };
}

export async function availableSlots(
  eventType: EventType,
  attendeeTz: string,
  from: string,
  to: string,
) {
  if (eventType.assignment !== "round_robin") {
    const input = await engineInput(eventType, attendeeTz, from, to);
    return computeSlots({ ...input, from, to });
  }
  // Round robin: a slot is offered when any host is free.
  const perHost = await Promise.all(
    eventHosts(eventType).map(async (h) =>
      computeSlots({ ...(await engineInput(eventType, attendeeTz, from, to, h)), from, to }),
    ),
  );
  const byDate = new Map<string, Map<number, Date>>();
  for (const days of perHost)
    for (const d of days) {
      const m = byDate.get(d.date) ?? new Map<number, Date>();
      for (const s of d.slots) m.set(s.getTime(), s);
      byDate.set(d.date, m);
    }
  return [...byDate.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, m]) => ({
      date,
      slots: [...m.values()].sort((a, b) => a.getTime() - b.getTime()),
    }));
}

async function hostCanTake(eventType: EventType, attendeeTz: string, start: Date, host: string) {
  const day = start.toISOString().slice(0, 10);
  const input = await engineInput(eventType, attendeeTz, day, day, host);
  return isSlotAvailable(input, start);
}

/**
 * Which host takes a booking at `start`, or null when nobody can. Round robin picks the free
 * host with the fewest upcoming bookings so load spreads evenly.
 */
export async function pickHost(
  eventType: EventType,
  attendeeTz: string,
  start: Date,
): Promise<string | null> {
  if (eventType.assignment !== "round_robin") {
    return (await hostCanTake(eventType, attendeeTz, start, eventType.userId))
      ? eventType.userId
      : null;
  }
  const hosts = eventHosts(eventType);
  const free = (
    await Promise.all(
      hosts.map(async (h) => ((await hostCanTake(eventType, attendeeTz, start, h)) ? h : null)),
    )
  ).filter((h): h is string => !!h);
  if (!free.length) return null;
  const loads = await Promise.all(
    free.map(async (h) => {
      const rows = await db()
        .select({ n: sql<number>`count(*)::int` })
        .from(schema.bookings)
        .where(
          and(
            eq(schema.bookings.hostUserId, h),
            inArray(schema.bookings.status, ["confirmed", "pending"]),
            gte(schema.bookings.startAt, new Date()),
          ),
        );
      return { h, n: rows[0]?.n ?? 0 };
    }),
  );
  loads.sort((a, b) => a.n - b.n || hosts.indexOf(a.h) - hosts.indexOf(b.h));
  return loads[0]!.h;
}

export async function slotIsBookable(eventType: EventType, attendeeTz: string, start: Date) {
  return (await pickHost(eventType, attendeeTz, start)) !== null;
}

/* ---------------- Bookings ---------------- */

export async function getBookingByToken(token: string): Promise<Booking | null> {
  return (
    (await db().query.bookings.findFirst({ where: eq(schema.bookings.manageToken, token) })) ?? null
  );
}

export async function listBookings(
  workspaceId: string,
  opts: { userId?: string; upcoming?: boolean; limit?: number } = {},
): Promise<(Booking & { eventTitle: string | null })[]> {
  const conds = [eq(schema.bookings.workspaceId, workspaceId)];
  if (opts.userId) conds.push(eq(schema.bookings.hostUserId, opts.userId));
  if (opts.upcoming === true) conds.push(gte(schema.bookings.endAt, new Date()));
  if (opts.upcoming === false) conds.push(lte(schema.bookings.endAt, new Date()));
  const rows = await db()
    .select({ b: schema.bookings, eventTitle: schema.eventTypes.title })
    .from(schema.bookings)
    .leftJoin(schema.eventTypes, eq(schema.eventTypes.id, schema.bookings.eventTypeId))
    .where(and(...conds))
    .orderBy(opts.upcoming === false ? desc(schema.bookings.startAt) : asc(schema.bookings.startAt))
    .limit(opts.limit ?? 200);
  return rows.map((r) => ({ ...r.b, eventTitle: r.eventTitle }));
}

export function locationLabel(loc: EventType["location"]): string {
  switch (loc.type) {
    case "daily":
      return "Video call";
    case "google_meet":
      return "Google Meet";
    case "zoom":
      return "Zoom";
    case "teams":
      return "Microsoft Teams";
    case "phone":
      return loc.value ? `Phone: ${loc.value}` : "Phone call";
    case "in_person":
      return loc.value ? `In person: ${loc.value}` : "In person";
    default:
      return loc.value ?? "To be confirmed";
  }
}

export type { Workspace };
