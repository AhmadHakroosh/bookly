import "server-only";
import { and, eq, gte, inArray, lte, schema, sql } from "@bookly/db";
import { sendEmail } from "@bookly/email";
import { db } from "@/lib/db";
import { brandFor } from "@/emails/brand";
import { followUpMail, reminderMail } from "@/emails/booking";
import { briefForBooking } from "./brief";
import { nudgeOverdueTasks } from "./capture";
import { expireTranscripts } from "./transcripts";
import { expireManualPlans, setState } from "./ops";
import { sendTelemetryPing } from "./telemetry";
import { trackBooking } from "./contacts";
import { notifyHost, sendText } from "./notify";
import { expireUnpaidBookings } from "./payments";
import { baseUrl, getProfileByUser } from "./scheduling";
import { fmtDateTime } from "@/lib/time";

/**
 * Sends reminders at each event type's configured offsets (minutes before the start) and
 * follow-ups after the meeting. Idempotent via `reminders_sent` keys (`r:<min>`, `followup`).
 */
export async function sendDueReminders(
  now = new Date(),
  opts: { bookingId?: string } = {},
): Promise<number> {
  const only = opts.bookingId ? eq(schema.bookings.id, opts.bookingId) : undefined;
  let sent = 0;
  // Candidates: confirmed bookings starting within the next 31 days (largest sensible offset).
  const upcoming = await db()
    .select()
    .from(schema.bookings)
    .where(
      and(
        only,
        eq(schema.bookings.status, "confirmed"),
        gte(schema.bookings.startAt, now),
        lte(schema.bookings.startAt, new Date(now.getTime() + 31 * 86_400_000)),
      ),
    )
    .limit(500);
  for (const b of upcoming) {
    const et = b.eventTypeId
      ? await db().query.eventTypes.findFirst({ where: eq(schema.eventTypes.id, b.eventTypeId) })
      : null;
    const offsets = et?.reminders?.length ? et.reminders : [1440, 60];
    const minutesLeft = (b.startAt.getTime() - now.getTime()) / 60_000;
    // Due when we are inside [offset, offset - 15min); catches up if the tick was late, but never after the start.
    const due = offsets.filter((m) => minutesLeft <= m && !b.remindersSent.includes(`r:${m}`));
    if (!due.length) continue;
    const [ws, host, hostUser] = await Promise.all([
      db().query.workspaces.findFirst({ where: eq(schema.workspaces.id, b.workspaceId) }),
      getProfileByUser(b.workspaceId, b.hostUserId),
      db().query.users.findFirst({
        where: eq(schema.users.id, b.hostUserId),
        columns: { email: true },
      }),
    ]);
    if (!ws || !host) continue;
    const ctx = {
      booking: b,
      eventType: et ?? null,
      host,
      workspaceName: ws.name,
      brand: brandFor(ws),
      templates: ws.settings.templates,
      baseUrl: baseUrl(),
    };
    // Only the nearest due offset gets a message; the others are just marked (avoids a burst after downtime).
    const m = Math.min(...due);
    const hours = Math.max(1, Math.round(m / 60));
    const a = await reminderMail(ctx, false, hours);
    const brief = await briefForBooking(ws, b, et ?? null).catch(() => null);
    const h = await reminderMail({ ...ctx, brief: brief ?? undefined }, true, hours);
    const line = `Reminder: ${et?.title ?? "Meeting"} with ${host.displayName} in ${hours === 1 ? "1 hour" : `${hours} hours`}. ${b.meetingUrl ?? `${baseUrl()}/booking/${b.manageToken}`}`;
    await Promise.all([
      sendEmail({
        to: b.attendeeEmail,
        subject: a.subject,
        text: a.text,
        html: a.html,
        replyTo: hostUser?.email ?? undefined,
        fromName: host.displayName,
      }),
      hostUser?.email
        ? sendEmail({ to: hostUser.email, subject: h.subject, text: h.text, html: h.html })
        : Promise.resolve(),
      et?.remindByText && b.attendeePhone
        ? sendText("sms", b.attendeePhone.replace(/[\s()-]/g, ""), line).then((ok) =>
            ok ? undefined : sendText("whatsapp", b.attendeePhone!.replace(/[\s()-]/g, ""), line),
          )
        : Promise.resolve(),
      m <= 60
        ? notifyHost(b.hostUserId, "reminder1h", {
            subject: h.subject,
            text: `${b.attendeeName} · ${et?.title ?? "Meeting"} in ${hours === 1 ? "1 hour" : `${hours} hours`}. ${b.meetingUrl ?? ""}`.trim(),
          })
        : Promise.resolve(),
    ]).catch((e) => console.error("[reminders]", e));
    await db()
      .update(schema.bookings)
      .set({ remindersSent: [...b.remindersSent, ...due.map((x) => `r:${x}`)] })
      .where(eq(schema.bookings.id, b.id));
    await trackBooking(ws, b, "email_sent", `Reminder (${hours}h) for ${et?.title ?? "meeting"}`);
    sent++;
  }

  // Follow-ups: meetings that ended, not cancelled / no-show, event type has follow-up enabled.
  const ended = await db()
    .select()
    .from(schema.bookings)
    .where(
      and(
        only,
        inArray(schema.bookings.status, ["confirmed", "completed"]),
        lte(schema.bookings.endAt, now),
        gte(schema.bookings.endAt, new Date(now.getTime() - 7 * 86_400_000)),
        sql`not (${schema.bookings.remindersSent} ? 'followup')`,
      ),
    )
    .limit(200);
  for (const b of ended) {
    const et = b.eventTypeId
      ? await db().query.eventTypes.findFirst({ where: eq(schema.eventTypes.id, b.eventTypeId) })
      : null;
    if (!et?.followUp?.enabled) continue;
    const delay = et.followUp.delayMin ?? 60;
    if (b.endAt.getTime() + delay * 60_000 > now.getTime()) continue;
    const [ws, host, hostUser] = await Promise.all([
      db().query.workspaces.findFirst({ where: eq(schema.workspaces.id, b.workspaceId) }),
      getProfileByUser(b.workspaceId, b.hostUserId),
      db().query.users.findFirst({
        where: eq(schema.users.id, b.hostUserId),
        columns: { email: true },
      }),
    ]);
    if (!ws || !host) continue;
    const mail = await followUpMail({
      booking: b,
      eventType: et,
      host,
      workspaceName: ws.name,
      brand: brandFor(ws),
      templates: ws.settings.templates,
      baseUrl: baseUrl(),
    });
    await sendEmail({
      to: b.attendeeEmail,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      replyTo: hostUser?.email ?? undefined,
      fromName: host?.displayName ?? ws.name,
    }).catch((e) => console.error("[followup]", e));
    await db()
      .update(schema.bookings)
      .set({ remindersSent: [...b.remindersSent, "followup"] })
      .where(eq(schema.bookings.id, b.id));
    await trackBooking(ws, b, "email_sent", `Follow-up email: ${mail.subject}`);
    sent++;
  }

  if (only) return sent;
  await expireUnpaidBookings(now).catch((e) => console.error("[payments] expire failed", e));
  await nudgeOverdueTasks(now).catch((e) => console.error("[tasks] nudge failed", e));
  await expireTranscripts(now).catch((e) => console.error("[capture] retention failed", e));
  await expireManualPlans(now).catch((e) => console.error("[ops] plan expiry failed", e));
  await sendTelemetryPing(now).catch((e) => console.error("[telemetry] failed", e));
  await setState("jobs.lastTick", { at: now.toISOString(), reminders: sent });
  // Mark finished meetings as completed (and note it on the contact's timeline).
  const done = await db()
    .update(schema.bookings)
    .set({ status: "completed" })
    .where(
      and(
        inArray(schema.bookings.status, ["confirmed"]),
        lte(schema.bookings.endAt, new Date(now.getTime() - 3600_000)),
      ),
    )
    .returning();
  for (const b of done) {
    const ws = await db().query.workspaces.findFirst({
      where: eq(schema.workspaces.id, b.workspaceId),
    });
    if (ws)
      await trackBooking(
        ws,
        b,
        "completed",
        `Meeting took place on ${fmtDateTime(b.startAt, b.timezone)}`,
      );
  }
  return sent;
}
