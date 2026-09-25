import "server-only";
import { publicBaseUrl } from "./urls";
import { and, asc, eq, gte, inArray, schema } from "@bookly/db";
import type { Booking, EventType, WaitlistEntry, Workspace } from "@bookly/db/schema";
import { sendEmail } from "@bookly/email";
import { db } from "@/lib/db";
import { fmtDate, fmtDateTime, utcToZoned } from "@/lib/time";
import { refreshWorkspace } from "./cache";
import { logContactEvent, upsertContact } from "./contacts";
import { getProfileByUser, newToken, occupiedSessions } from "./scheduling";

export type WaitlistTarget = { startAt: Date } | { date: string };

/** Full group sessions on `date` (attendee tz) that people can wait for. */
export async function fullSessions(
  eventType: EventType,
  tz: string,
  date: string,
): Promise<Date[]> {
  if (eventType.seats <= 1) return [];
  const from = new Date(`${date}T00:00:00Z`);
  from.setUTCDate(from.getUTCDate() - 1);
  const to = new Date(`${date}T23:59:59Z`);
  to.setUTCDate(to.getUTCDate() + 1);
  const hosts =
    eventType.assignment === "single"
      ? [eventType.userId]
      : [eventType.userId, ...eventType.hostUserIds];
  const sessions = (
    await Promise.all(hosts.map((h) => occupiedSessions(eventType.id, h, from, to)))
  ).flat();
  return sessions
    .filter((s) => s.count >= eventType.seats && utcToZoned(s.start, tz).date === date)
    .map((s) => s.start)
    .sort((a, b) => a.getTime() - b.getTime());
}

export async function joinWaitlist(
  workspace: Workspace,
  eventType: EventType,
  input: { name: string; email: string; timezone: string; target: WaitlistTarget },
): Promise<WaitlistEntry> {
  if (!eventType.waitlistEnabled) throw new Error("This event type has no waitlist.");
  const email = input.email.trim().toLowerCase();
  const startAt = "startAt" in input.target ? input.target.startAt : null;
  const date = "date" in input.target ? input.target.date : null;
  const existing = await db().query.waitlistEntries.findFirst({
    where: and(
      eq(schema.waitlistEntries.eventTypeId, eventType.id),
      eq(schema.waitlistEntries.attendeeEmail, email),
      eq(schema.waitlistEntries.status, "waiting"),
      startAt
        ? eq(schema.waitlistEntries.startAt, startAt)
        : eq(schema.waitlistEntries.date, date!),
    ),
  });
  if (existing) return existing;
  const [entry] = await db()
    .insert(schema.waitlistEntries)
    .values({
      workspaceId: workspace.id,
      eventTypeId: eventType.id,
      startAt,
      date,
      timezone: input.timezone,
      attendeeName: input.name.trim().slice(0, 120),
      attendeeEmail: email,
      token: newToken(),
    })
    .returning();
  const contact = await upsertContact(workspace.id, { email, name: input.name });
  await logContactEvent(
    workspace.id,
    contact.id,
    "waitlist_joined",
    `Joined the waitlist for ${eventType.title}`,
    {
      data: { startAt: startAt?.toISOString() ?? null, date },
    },
  );
  const host = await getProfileByUser(workspace.id, eventType.userId);
  const when = startAt
    ? fmtDateTime(startAt, input.timezone)
    : fmtDate(new Date(`${date}T12:00:00Z`), "UTC");
  await sendEmail({
    to: email,
    subject: `You're on the waitlist: ${eventType.title}`,
    text: `We'll email you as soon as a spot opens for ${eventType.title} with ${host?.displayName ?? workspace.name} (${when}).\n\nLeave the waitlist: ${await publicBaseUrl(workspace)}/waitlist/${entry!.token}`,
  }).catch((e) => console.error("[waitlist] email failed", e));
  refreshWorkspace(workspace.id);
  return entry!;
}

export async function leaveWaitlist(token: string): Promise<WaitlistEntry | null> {
  const [e] = await db()
    .update(schema.waitlistEntries)
    .set({ status: "left" })
    .where(eq(schema.waitlistEntries.token, token))
    .returning();
  return e ?? null;
}

export async function removeWaitlistEntry(workspaceId: string, id: string) {
  await db()
    .update(schema.waitlistEntries)
    .set({ status: "left" })
    .where(
      and(eq(schema.waitlistEntries.id, id), eq(schema.waitlistEntries.workspaceId, workspaceId)),
    );
  refreshWorkspace(workspaceId);
}

/** Upcoming waiting entries for the admin bookings page. */
export async function listWaitlist(workspaceId: string, hostUserId?: string) {
  const rows = await db()
    .select({
      e: schema.waitlistEntries,
      eventTitle: schema.eventTypes.title,
      hostUserId: schema.eventTypes.userId,
    })
    .from(schema.waitlistEntries)
    .innerJoin(schema.eventTypes, eq(schema.eventTypes.id, schema.waitlistEntries.eventTypeId))
    .where(
      and(
        eq(schema.waitlistEntries.workspaceId, workspaceId),
        eq(schema.waitlistEntries.status, "waiting"),
        gte(schema.waitlistEntries.createdAt, new Date(Date.now() - 90 * 86_400_000)),
      ),
    )
    .orderBy(asc(schema.waitlistEntries.createdAt));
  return rows
    .filter((r) => !hostUserId || r.hostUserId === hostUserId)
    .map((r) => ({ ...r.e, eventTitle: r.eventTitle }));
}

/**
 * A booking was cancelled: tell people waiting for that session (group events, one per freed
 * seat) or for that day (any event type) that they can book now. First come, first served.
 */
export async function notifyWaitlist(
  workspace: Workspace,
  booking: Booking,
  eventType: EventType | null,
) {
  if (!eventType || booking.startAt < new Date()) return 0;
  const waiting = await db()
    .select()
    .from(schema.waitlistEntries)
    .where(
      and(
        eq(schema.waitlistEntries.eventTypeId, eventType.id),
        eq(schema.waitlistEntries.status, "waiting"),
      ),
    )
    .orderBy(asc(schema.waitlistEntries.createdAt));
  const forSession = waiting.filter(
    (w) => w.startAt && w.startAt.getTime() === booking.startAt.getTime(),
  );
  const forDay = waiting.filter(
    (w) => w.date && utcToZoned(booking.startAt, w.timezone).date === w.date,
  );
  // One seat freed → the first person waiting for the session; a whole slot freed → everyone waiting for that day.
  const targets = [...forSession.slice(0, 1), ...forDay];
  if (!targets.length) return 0;
  const [host, profileOwner] = await Promise.all([
    getProfileByUser(workspace.id, booking.hostUserId),
    getProfileByUser(workspace.id, eventType.userId),
  ]);
  const base = await publicBaseUrl(workspace);
  const page = `${base}/${profileOwner?.username ?? ""}/${eventType.slug}`;
  await Promise.all(
    targets.map((w) => {
      const link = w.startAt
        ? `${page}?tz=${encodeURIComponent(w.timezone)}&date=${utcToZoned(w.startAt, w.timezone).date}&slot=${encodeURIComponent(w.startAt.toISOString())}`
        : `${page}?tz=${encodeURIComponent(w.timezone)}&date=${w.date}`;
      const when = w.startAt
        ? fmtDateTime(w.startAt, w.timezone)
        : fmtDate(new Date(`${w.date}T12:00:00Z`), "UTC");
      return sendEmail({
        to: w.attendeeEmail,
        subject: `A spot opened: ${eventType.title}`,
        text: `Good news, ${w.attendeeName}: a spot opened for ${eventType.title} with ${host?.displayName ?? workspace.name} (${when}). It goes to whoever books first:\n\n${link}\n\nYou were emailed because you joined the waitlist. Leave it: ${base}/waitlist/${w.token}`,
      }).catch((e) => console.error("[waitlist] notify failed", e));
    }),
  );
  await db()
    .update(schema.waitlistEntries)
    .set({ status: "notified", notifiedAt: new Date() })
    .where(
      inArray(
        schema.waitlistEntries.id,
        targets.map((t) => t.id),
      ),
    );
  return targets.length;
}
