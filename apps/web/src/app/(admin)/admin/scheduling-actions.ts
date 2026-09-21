"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { and, eq, schema } from "@bookly/db";
import type { EventLocation } from "@bookly/db/schema";
import { db } from "@/lib/db";
import { fmtDateTime, hhmmToMin, isValidTimezone } from "@/lib/time";
import { cancelBooking, confirmBooking } from "@/server/booking-flow";
import { trackBooking } from "@/server/contacts";
import { refreshWorkspace } from "@/server/cache";
import { parseQuestions, parseQuestionsJson, parseReminders } from "@/server/questions";
import { MAX_OCCURRENCES } from "@/server/recurrence";
import { ensureDefaultSchedule, getProfileByUser } from "@/server/scheduling";
import { assertFeature, assertWithinLimit, LimitError } from "@/server/limits";
import { requireStaff } from "@/server/session";
import { removeWaitlistEntry } from "@/server/waitlist";
import { getCurrentWorkspace } from "@/server/workspace";

async function ctx() {
  const [{ session }, ws] = await Promise.all([requireStaff(), getCurrentWorkspace()]);
  if (!ws) throw new Error("No workspace");
  return { session, ws };
}
const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

/* ---------------- Profile ---------------- */

const profileSchema = z.object({
  username: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9-]+$/i, "Letters, numbers and dashes only"),
  displayName: z.string().trim().min(1).max(80),
  bio: z.string().trim().max(300).default(""),
  timezone: z.string().refine(isValidTimezone, "Unknown timezone"),
  avatarUrl: z.string().max(2000).default(""),
});

export async function saveProfile(_prev: { ok?: boolean; error?: string }, formData: FormData) {
  const { session, ws } = await ctx();
  const parsed = profileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Please check the form." };
  const d = parsed.data;
  const username = d.username.toLowerCase();
  const taken = await db().query.profiles.findFirst({
    where: and(eq(schema.profiles.workspaceId, ws.id), eq(schema.profiles.username, username)),
  });
  if (taken && taken.userId !== session.user.id) return { error: "That username is taken." };
  await db()
    .insert(schema.profiles)
    .values({
      workspaceId: ws.id,
      userId: session.user.id,
      username,
      displayName: d.displayName,
      bio: d.bio || null,
      timezone: d.timezone,
      avatarUrl: d.avatarUrl || null,
    })
    .onConflictDoUpdate({
      target: [schema.profiles.workspaceId, schema.profiles.userId],
      set: {
        username,
        displayName: d.displayName,
        bio: d.bio || null,
        timezone: d.timezone,
        avatarUrl: d.avatarUrl || null,
      },
    });
  await ensureDefaultSchedule(ws.id, session.user.id, d.timezone);
  refreshWorkspace(ws.id);
  return { ok: true };
}

/* ---------------- Availability ---------------- */

export async function saveSchedule(_prev: { ok?: boolean; error?: string }, formData: FormData) {
  const { session, ws } = await ctx();
  const scheduleId = String(formData.get("scheduleId") ?? "");
  const timezone = String(formData.get("timezone") ?? "UTC");
  if (!isValidTimezone(timezone)) return { error: "Unknown timezone" };
  const s = await db().query.schedules.findFirst({
    where: and(
      eq(schema.schedules.id, scheduleId),
      eq(schema.schedules.workspaceId, ws.id),
      eq(schema.schedules.userId, session.user.id),
    ),
  });
  if (!s) return { error: "Schedule not found" };
  const rules: { weekday: number; startMin: number; endMin: number }[] = [];
  for (let wd = 0; wd < 7; wd++) {
    if (!formData.get(`on_${wd}`)) continue;
    const starts = formData.getAll(`start_${wd}`).map(String);
    const ends = formData.getAll(`end_${wd}`).map(String);
    starts.forEach((st, i) => {
      const a = hhmmToMin(st);
      const b = hhmmToMin(ends[i] ?? "");
      if (b > a) rules.push({ weekday: wd, startMin: a, endMin: b });
    });
  }
  await db().transaction(async (tx) => {
    await tx
      .update(schema.schedules)
      .set({ timezone, name: String(formData.get("name") ?? s.name).trim() || s.name })
      .where(eq(schema.schedules.id, s.id));
    await tx.delete(schema.scheduleRules).where(eq(schema.scheduleRules.scheduleId, s.id));
    if (rules.length)
      await tx.insert(schema.scheduleRules).values(rules.map((r) => ({ ...r, scheduleId: s.id })));
  });
  refreshWorkspace(ws.id);
  return { ok: true };
}

export async function addOverride(formData: FormData) {
  const { session, ws } = await ctx();
  const scheduleId = String(formData.get("scheduleId") ?? "");
  const date = String(formData.get("date") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
  const s = await db().query.schedules.findFirst({
    where: and(
      eq(schema.schedules.id, scheduleId),
      eq(schema.schedules.workspaceId, ws.id),
      eq(schema.schedules.userId, session.user.id),
    ),
  });
  if (!s) return;
  const blocked = formData.get("blocked") === "on";
  const start = String(formData.get("start") ?? "");
  const end = String(formData.get("end") ?? "");
  await db()
    .delete(schema.scheduleOverrides)
    .where(
      and(eq(schema.scheduleOverrides.scheduleId, s.id), eq(schema.scheduleOverrides.date, date)),
    );
  await db()
    .insert(schema.scheduleOverrides)
    .values(
      blocked || !start || !end
        ? { scheduleId: s.id, date, startMin: null, endMin: null }
        : { scheduleId: s.id, date, startMin: hhmmToMin(start), endMin: hhmmToMin(end) },
    );
  refreshWorkspace(ws.id);
}

export async function removeOverride(id: string) {
  const { session, ws } = await ctx();
  const row = await db()
    .select({ id: schema.scheduleOverrides.id })
    .from(schema.scheduleOverrides)
    .innerJoin(schema.schedules, eq(schema.schedules.id, schema.scheduleOverrides.scheduleId))
    .where(
      and(
        eq(schema.scheduleOverrides.id, id),
        eq(schema.schedules.workspaceId, ws.id),
        eq(schema.schedules.userId, session.user.id),
      ),
    );
  if (row[0])
    await db().delete(schema.scheduleOverrides).where(eq(schema.scheduleOverrides.id, row[0].id));
  refreshWorkspace(ws.id);
}

/* ---------------- Event types ---------------- */

export async function createEventType() {
  const { session, ws } = await ctx();
  await assertWithinLimit(ws, "eventTypes");
  const profile = await getProfileByUser(ws.id, session.user.id);
  if (!profile) redirect("/admin/profile?setup=1");
  const schedule = await ensureDefaultSchedule(ws.id, session.user.id, profile.timezone);
  const id = crypto.randomUUID();
  await db()
    .insert(schema.eventTypes)
    .values({
      id,
      workspaceId: ws.id,
      userId: session.user.id,
      scheduleId: schedule.id,
      slug: `meeting-${id.slice(0, 4)}`,
      title: "New meeting",
      durationMin: 30,
    });
  redirect(`/admin/event-types/${id}`);
}

const LOCATIONS = [
  "daily",
  "google_meet",
  "zoom",
  "teams",
  "phone",
  "in_person",
  "custom",
] as const;
const eventSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1).max(120),
  slug: z.string().trim().min(1).max(48),
  description: z.string().trim().max(2000).default(""),
  durationMin: z.coerce
    .number()
    .int()
    .min(5)
    .max(24 * 60),
  slotIntervalMin: z.coerce
    .number()
    .int()
    .min(0)
    .max(24 * 60)
    .default(0),
  bufferBeforeMin: z.coerce.number().int().min(0).max(240).default(0),
  bufferAfterMin: z.coerce.number().int().min(0).max(240).default(0),
  minNoticeMin: z.coerce
    .number()
    .int()
    .min(0)
    .max(30 * 24 * 60)
    .default(120),
  maxDaysAhead: z.coerce.number().int().min(1).max(365).default(60),
  maxPerDay: z.coerce.number().int().min(0).max(100).default(0),
  locationType: z.enum(LOCATIONS),
  locationValue: z.string().trim().max(300).default(""),
  color: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i)
    .default("#2563eb"),
  scheduleId: z.string().default(""),
  questions: z.string().max(5000).default(""),
  questionsJson: z.string().max(20000).default(""),
  reminders: z.string().max(200).default("1440, 60"),
  followUpEnabled: z.enum(["on", "off"]).default("off"),
  followUpDelay: z.coerce
    .number()
    .min(0)
    .max(24 * 14)
    .default(1),
  followUpSubject: z.string().trim().max(200).default(""),
  followUpBody: z.string().trim().max(5000).default(""),
  assignment: z.enum(["single", "round_robin", "collective"]).default("single"),
  seats: z.coerce.number().int().min(1).max(500).default(1),
  recurEnabled: z.enum(["on", "off"]).default("off"),
  recurFreq: z.enum(["daily", "weekly", "monthly"]).default("weekly"),
  recurInterval: z.coerce.number().int().min(1).max(12).default(1),
  recurCount: z.coerce.number().int().min(2).max(MAX_OCCURRENCES).default(4),
  requiresConfirmation: z.enum(["on", "off"]).default("off"),
  hidden: z.enum(["on", "off"]).default("off"),
  remindByText: z.enum(["on", "off"]).default("off"),
  price: z.coerce.number().min(0).max(100000).default(0),
  currency: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z]{3}$/, "Currency must be a 3-letter code")
    .default("usd"),
});

export async function saveEventType(
  _prev: { ok?: boolean; error?: string; slug?: string },
  formData: FormData,
) {
  const { ws } = await ctx();
  const parsed = eventSchema.safeParse({
    ...Object.fromEntries(formData),
    requiresConfirmation: formData.get("requiresConfirmation") ? "on" : "off",
    hidden: formData.get("hidden") ? "on" : "off",
    remindByText: formData.get("remindByText") ? "on" : "off",
    followUpEnabled: formData.get("followUpEnabled") ? "on" : "off",
    recurEnabled: formData.get("recurEnabled") ? "on" : "off",
  });
  const hostUserIds = formData.getAll("hostUserIds").map(String).slice(0, 20);
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Please check the form." };
  const d = parsed.data;
  const existing = await db().query.eventTypes.findFirst({
    where: and(eq(schema.eventTypes.id, d.id), eq(schema.eventTypes.workspaceId, ws.id)),
  });
  if (!existing) return { error: "Event type not found" };
  let slug = slugify(d.slug) || slugify(d.title) || "meeting";
  const clash = await db().query.eventTypes.findFirst({
    where: and(eq(schema.eventTypes.userId, existing.userId), eq(schema.eventTypes.slug, slug)),
    columns: { id: true },
  });
  if (clash && clash.id !== d.id) slug = `${slug}-${d.id.slice(0, 4)}`;
  const location: EventLocation = { type: d.locationType, value: d.locationValue || undefined };
  try {
    if (d.price > 0) assertFeature(ws, "payments");
    if (d.assignment !== "single") assertFeature(ws, "teamScheduling");
    if (
      d.followUpEnabled === "on" ||
      d.remindByText === "on" ||
      parseReminders(d.reminders).join() !== "1440,60"
    )
      assertFeature(ws, "workflows");
  } catch (e) {
    if (e instanceof LimitError) return { error: `${e.message} (Billing)` };
    throw e;
  }
  await db()
    .update(schema.eventTypes)
    .set({
      title: d.title,
      slug,
      description: d.description || null,
      durationMin: d.durationMin,
      slotIntervalMin: d.slotIntervalMin || null,
      bufferBeforeMin: d.bufferBeforeMin,
      bufferAfterMin: d.bufferAfterMin,
      minNoticeMin: d.minNoticeMin,
      maxDaysAhead: d.maxDaysAhead,
      maxPerDay: d.maxPerDay || null,
      location,
      color: d.color,
      scheduleId: d.scheduleId || existing.scheduleId,
      questions: d.questionsJson
        ? parseQuestionsJson(d.questionsJson)
        : parseQuestions(d.questions),
      reminders: parseReminders(d.reminders),
      followUp: {
        enabled: d.followUpEnabled === "on",
        delayMin: Math.round(d.followUpDelay * 60),
        subject: d.followUpSubject || undefined,
        body: d.followUpBody || undefined,
      },
      assignment: d.assignment,
      hostUserIds: d.assignment === "single" ? [] : hostUserIds,
      seats: d.seats,
      recurrence:
        d.recurEnabled === "on"
          ? { enabled: true, freq: d.recurFreq, interval: d.recurInterval, count: d.recurCount }
          : {},
      requiresConfirmation: d.requiresConfirmation === "on",
      hidden: d.hidden === "on",
      remindByText: d.remindByText === "on",
      priceCents: d.price > 0 ? Math.round(d.price * 100) : null,
      currency: d.price > 0 ? d.currency : null,
    })
    .where(eq(schema.eventTypes.id, d.id));
  refreshWorkspace(ws.id);
  return { ok: true, slug };
}

export async function deleteEventType(id: string) {
  const { ws } = await ctx();
  await db()
    .update(schema.eventTypes)
    .set({ active: false, hidden: true })
    .where(and(eq(schema.eventTypes.id, id), eq(schema.eventTypes.workspaceId, ws.id)));
  refreshWorkspace(ws.id);
  redirect("/admin/event-types");
}

/* ---------------- Bookings ---------------- */

export async function hostCancel(id: string, formData: FormData) {
  const { ws } = await ctx();
  await cancelBooking(ws, id, "host", String(formData.get("reason") ?? ""));
}

export async function hostMark(id: string, status: "completed" | "no_show" | "confirmed") {
  const { ws } = await ctx();
  const [b] = await db()
    .update(schema.bookings)
    .set({ status })
    .where(and(eq(schema.bookings.id, id), eq(schema.bookings.workspaceId, ws.id)))
    .returning();
  if (b && status !== "confirmed")
    await trackBooking(
      ws,
      b,
      status,
      status === "no_show"
        ? `Did not show up on ${fmtDateTime(b.startAt, b.timezone)}`
        : `Meeting took place on ${fmtDateTime(b.startAt, b.timezone)}`,
    );
  refreshWorkspace(ws.id);
}

export async function hostConfirm(id: string) {
  const { ws } = await ctx();
  await confirmBooking(ws, id);
}

export async function hostRemoveWaitlist(id: string) {
  const { ws } = await ctx();
  await removeWaitlistEntry(ws.id, id);
}
