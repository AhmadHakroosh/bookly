import "server-only";
import { createHash } from "node:crypto";
import { cacheLife, cacheTag } from "next/cache";
import { and, asc, desc, eq, gte, inArray, lte, schema } from "@bookly/db";
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

async function engineInput(eventType: EventType, attendeeTz: string, from: string, to: string) {
  const schedule = eventType.scheduleId ? await getSchedule(eventType.scheduleId) : null;
  const fallback =
    schedule ??
    (await getSchedule(
      (await ensureDefaultSchedule(eventType.workspaceId, eventType.userId, "UTC")).id,
    ))!;
  const rangeStart = new Date(`${addDays(from, -2)}T00:00:00Z`);
  const rangeEnd = new Date(`${addDays(to, 2)}T23:59:59Z`);
  const [busy, ext] = await Promise.all([
    hostBusy(eventType.userId, rangeStart, rangeEnd),
    externalBusy(eventType.userId, rangeStart, rangeEnd),
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
    maxDaysAhead: eventType.maxDaysAhead,
    maxPerDay: eventType.maxPerDay,
    busy: [...busy, ...ext],
    attendeeTz,
  };
}

export async function availableSlots(
  eventType: EventType,
  attendeeTz: string,
  from: string,
  to: string,
) {
  const input = await engineInput(eventType, attendeeTz, from, to);
  return computeSlots({ ...input, from, to });
}

export async function slotIsBookable(
  eventType: EventType,
  attendeeTz: string,
  start: Date,
  ignoreBookingId?: string,
) {
  const input = await engineInput(
    eventType,
    attendeeTz,
    start.toISOString().slice(0, 10),
    start.toISOString().slice(0, 10),
  );
  if (ignoreBookingId) {
    const b = await db().query.bookings.findFirst({
      where: eq(schema.bookings.id, ignoreBookingId),
      columns: { startAt: true },
    });
    if (b) input.busy = input.busy.filter((i) => i.start.getTime() !== b.startAt.getTime());
  }
  return isSlotAvailable(input, start);
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
