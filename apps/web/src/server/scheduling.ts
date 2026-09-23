import "server-only";
import { formatPhone, looksLikePhone } from "@/lib/phone";
import { createHash } from "node:crypto";
import { cacheLife, cacheTag } from "next/cache";
import { and, asc, desc, eq, gte, inArray, lte, ne, schema, sql } from "@bookly/db";
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
import {
  computeSlots,
  isSlotAvailable,
  seatsLeft,
  type Interval,
  type Occupied,
  type SeatMap,
} from "./availability/engine";
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

/** Overrides on several schedules at once (the availability page marks shared days off). */
export async function listOverrides(scheduleIds: string[]) {
  if (!scheduleIds.length) return [];
  return db()
    .select()
    .from(schema.scheduleOverrides)
    .where(inArray(schema.scheduleOverrides.scheduleId, scheduleIds));
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

const ACTIVE = ["confirmed", "pending"] as const;

/**
 * Host's booked intervals in a range (all event types), for the engine's `busy` input.
 * `excludeEventTypeId` leaves out a group event type whose sessions are passed as `occupied`.
 */
export async function hostBusy(
  hostUserId: string,
  from: Date,
  to: Date,
  excludeEventTypeId?: string,
): Promise<Interval[]> {
  const conds = [
    eq(schema.bookings.hostUserId, hostUserId),
    inArray(schema.bookings.status, [...ACTIVE]),
    lte(schema.bookings.startAt, to),
    gte(schema.bookings.endAt, from),
  ];
  if (excludeEventTypeId) conds.push(ne(schema.bookings.eventTypeId, excludeEventTypeId));
  const rows = await db()
    .select({ start: schema.bookings.startAt, end: schema.bookings.endAt })
    .from(schema.bookings)
    .where(and(...conds));
  return rows;
}

/** Group sessions of one event type on a host's calendar, with how many seats each has taken. */
export async function occupiedSessions(
  eventTypeId: string,
  hostUserId: string,
  from: Date,
  to: Date,
): Promise<Occupied[]> {
  const rows = await db()
    .select({
      start: schema.bookings.startAt,
      end: schema.bookings.endAt,
      count: sql<number>`count(*)::int`,
    })
    .from(schema.bookings)
    .where(
      and(
        eq(schema.bookings.eventTypeId, eventTypeId),
        eq(schema.bookings.hostUserId, hostUserId),
        inArray(schema.bookings.status, [...ACTIVE]),
        lte(schema.bookings.startAt, to),
        gte(schema.bookings.endAt, from),
      ),
    )
    .groupBy(schema.bookings.startAt, schema.bookings.endAt);
  return rows;
}

/** Host of the group session already running at `start`, if any (new attendees join it). */
export async function sessionHost(eventType: EventType, start: Date): Promise<string | null> {
  if (eventType.seats <= 1) return null;
  const row = await db().query.bookings.findFirst({
    where: and(
      eq(schema.bookings.eventTypeId, eventType.id),
      eq(schema.bookings.startAt, start),
      inArray(schema.bookings.status, [...ACTIVE]),
    ),
    columns: { hostUserId: true },
  });
  return row?.hostUserId ?? null;
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

async function allBusy(
  hostUserId: string,
  rangeStart: Date,
  rangeEnd: Date,
  excludeEventTypeId?: string,
) {
  const [busy, ext] = await Promise.all([
    hostBusy(hostUserId, rangeStart, rangeEnd, excludeEventTypeId),
    externalBusy(hostUserId, rangeStart, rangeEnd),
  ]);
  return [...busy, ...ext];
}

/**
 * Options for slot listing / validation. `horizon: false` ignores `maxDaysAhead` (later series
 * occurrences); `priority` lets existing customers into focus blocks and past the weekly budget.
 */
export type SlotOptions = { horizon?: boolean; priority?: boolean };

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
  opts: SlotOptions = {},
) {
  const fallback = await hostSchedule(eventType, hostUserId);
  const rangeStart = new Date(`${addDays(from, -2)}T00:00:00Z`);
  const rangeEnd = new Date(`${addDays(to, 2)}T23:59:59Z`);
  const hosts = eventType.assignment === "collective" ? eventHosts(eventType) : [hostUserId];
  const group = eventType.seats > 1;
  const [busyAll, occupied] = await Promise.all([
    Promise.all(
      hosts.map((h) => allBusy(h, rangeStart, rangeEnd, group ? eventType.id : undefined)),
    ).then((r) => r.flat()),
    group
      ? Promise.all(hosts.map((h) => occupiedSessions(eventType.id, h, rangeStart, rangeEnd))).then(
          (r) => r.flat(),
        )
      : Promise.resolve([] as Occupied[]),
  ]);
  return {
    scheduleTz: fallback.timezone,
    rules: fallback.rules,
    overrides: fallback.overrides,
    durationMin: eventType.durationMin,
    slotIntervalMin: eventType.slotIntervalMin,
    bufferBeforeMin: eventType.bufferBeforeMin,
    bufferAfterMin: eventType.bufferAfterMin,
    minNoticeMin: eventType.minNoticeMin,
    maxDaysAhead: opts.horizon === false ? 3660 : eventType.maxDaysAhead,
    maxPerDay: eventType.maxPerDay,
    busy: busyAll,
    seats: eventType.seats,
    occupied,
    priority: opts.priority,
    weeklyBudget: fallback.weeklyBudget,
    attendeeTz,
  };
}

/** Free seats per offered slot of a group event type (empty map for regular ones). */
export async function slotSeats(
  eventType: EventType,
  slots: Date[],
  hostUserId: string = eventType.userId,
): Promise<SeatMap> {
  if (eventType.seats <= 1 || !slots.length) return new Map();
  const from = new Date(Math.min(...slots.map((s) => s.getTime())) - 86_400_000);
  const to = new Date(Math.max(...slots.map((s) => s.getTime())) + 86_400_000);
  const hosts = eventType.assignment === "single" ? [hostUserId] : eventHosts(eventType);
  const occupied = (
    await Promise.all(hosts.map((h) => occupiedSessions(eventType.id, h, from, to)))
  ).flat();
  return seatsLeft(eventType.seats, occupied, slots);
}

export async function availableSlots(
  eventType: EventType,
  attendeeTz: string,
  from: string,
  to: string,
  opts: SlotOptions = {},
) {
  if (eventType.assignment !== "round_robin") {
    const input = await engineInput(eventType, attendeeTz, from, to, eventType.userId, opts);
    return computeSlots({ ...input, from, to });
  }
  // Round robin: a slot is offered when any host is free.
  const perHost = await Promise.all(
    eventHosts(eventType).map(async (h) =>
      computeSlots({
        ...(await engineInput(eventType, attendeeTz, from, to, h, opts)),
        from,
        to,
      }),
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

async function hostCanTake(
  eventType: EventType,
  attendeeTz: string,
  start: Date,
  host: string,
  opts: SlotOptions = {},
) {
  const day = start.toISOString().slice(0, 10);
  const input = await engineInput(eventType, attendeeTz, day, day, host, opts);
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
  opts: SlotOptions = {},
): Promise<string | null> {
  // Group events: later attendees join the session that already exists at this start.
  const running = await sessionHost(eventType, start);
  if (running)
    return (await hostCanTake(eventType, attendeeTz, start, running, opts)) ? running : null;
  if (eventType.assignment !== "round_robin") {
    return (await hostCanTake(eventType, attendeeTz, start, eventType.userId, opts))
      ? eventType.userId
      : null;
  }
  const hosts = eventHosts(eventType);
  const free = (
    await Promise.all(
      hosts.map(async (h) =>
        (await hostCanTake(eventType, attendeeTz, start, h, opts)) ? h : null,
      ),
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

export async function slotIsBookable(
  eventType: EventType,
  attendeeTz: string,
  start: Date,
  opts: SlotOptions = {},
) {
  return (await pickHost(eventType, attendeeTz, start, opts)) !== null;
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
): Promise<(Booking & { eventTitle: string | null; eventSeats: number | null })[]> {
  const conds = [eq(schema.bookings.workspaceId, workspaceId)];
  if (opts.userId) conds.push(eq(schema.bookings.hostUserId, opts.userId));
  if (opts.upcoming === true) conds.push(gte(schema.bookings.endAt, new Date()));
  if (opts.upcoming === false) conds.push(lte(schema.bookings.endAt, new Date()));
  const rows = await db()
    .select({
      b: schema.bookings,
      eventTitle: schema.eventTypes.title,
      eventSeats: schema.eventTypes.seats,
    })
    .from(schema.bookings)
    .leftJoin(schema.eventTypes, eq(schema.eventTypes.id, schema.bookings.eventTypeId))
    .where(and(...conds))
    .orderBy(opts.upcoming === false ? desc(schema.bookings.startAt) : asc(schema.bookings.startAt))
    .limit(opts.limit ?? 200);
  return rows.map((r) => ({ ...r.b, eventTitle: r.eventTitle, eventSeats: r.eventSeats }));
}

export const LOCATION_TYPES = [
  "daily",
  "google_meet",
  "zoom",
  "teams",
  "phone",
  "in_person",
  "custom",
] as const;

/** The editor's JSON, or the legacy single fields; deduplicated by type, values trimmed. */
export function parseLocations(
  json: string,
  legacyType?: string,
  legacyValue?: string,
): EventType["location"][] {
  let raw: unknown = null;
  if (json) {
    try {
      raw = JSON.parse(json);
    } catch {
      raw = null;
    }
  }
  const list = Array.isArray(raw)
    ? raw
    : legacyType
      ? [{ type: legacyType, value: legacyValue || undefined }]
      : [];
  const out: EventType["location"][] = [];
  for (const item of list as { type?: unknown; value?: unknown }[]) {
    const type = String(item?.type ?? "");
    if (!(LOCATION_TYPES as readonly string[]).includes(type) || out.some((l) => l.type === type))
      continue;
    const value = typeof item.value === "string" ? item.value.trim().slice(0, 300) : "";
    out.push({ type: type as EventType["location"]["type"], ...(value ? { value } : {}) });
  }
  return out.slice(0, 7);
}

/** Every location an event type offers; older rows only have `location`. */
export function eventLocations(
  et: Pick<EventType, "location" | "locations">,
): EventType["location"][] {
  return et.locations.length ? et.locations : [et.location];
}

/** The location an attendee picked by type, or the event type's default when there is one choice. */
export function pickLocation(
  et: Pick<EventType, "location" | "locations">,
  type: string | null | undefined,
): EventType["location"] | null {
  const all = eventLocations(et);
  if (!type) return all.length === 1 ? all[0]! : null;
  return all.find((l) => l.type === type) ?? null;
}

/** "Bookly video, Zoom or phone" for lists and cards. */
export function locationsLabel(locs: EventType["location"][]): string {
  const labels = locs.map((l) => locationLabel(l));
  if (labels.length <= 1) return labels[0] ?? "";
  return `${labels.slice(0, -1).join(", ")} or ${labels[labels.length - 1]}`;
}

export function locationLabel(loc: EventType["location"]): string {
  switch (loc.type) {
    case "daily":
      return "Bookly video";
    case "google_meet":
      return "Google Meet";
    case "zoom":
      return "Zoom";
    case "teams":
      return "Microsoft Teams";
    case "phone":
      return loc.value
        ? looksLikePhone(loc.value)
          ? `Phone call to ${formatPhone(loc.value)}`
          : `Phone call (${loc.value})`
        : "Phone call";
    case "in_person":
      return loc.value ? `In person: ${loc.value}` : "In person";
    default:
      return loc.value ?? "To be confirmed";
  }
}

export type { Workspace };
