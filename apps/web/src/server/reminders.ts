import "server-only";
import { dueReminderOffsets } from "@/lib/reminder-offsets";
import { adminBaseUrl, publicBaseUrl } from "./urls";
import { and, eq, gte, inArray, lte, schema, sql } from "@bookly/db";
import { sendEmail } from "@bookly/email";
import { db } from "@/lib/db";
import { brandFor } from "@/emails/brand";
import { followUpMail, reminderMail } from "@/emails/booking";
import { briefForBooking } from "./brief";
import { nudgeOverdueTasks } from "./capture";
import { expireTranscripts } from "./transcripts";
import { reconcileSeats } from "./billing";
import { expireManualPlans, setState } from "./ops";
import { sweepAuditLog } from "./audit";
import { sweepPendingFiles } from "./files";
import { sweepFormDrafts } from "./forms";
import { sendTelemetryPing } from "./telemetry";
import { ensureDailyWebhook } from "./daily-webhook";
import { trackBooking } from "./contacts";
import { purgeTrash } from "./drive";
import { postDueNotes } from "./meeting-notes";
import { replyToFor } from "./inbound";
import { notify, pruneNotifications, sendDueFallbacks, wantsEmail } from "./notifications";
import { textAttendee } from "./notify";
import { expireUnpaidBookings } from "./payments";
import { prunePresence } from "./realtime";
import { getProfileByUser } from "./scheduling";
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
    // Catches up if the tick was late, never after the start, and skips offsets that had already
    // passed when the booking was made (a same-day booking gets no "tomorrow" reminder).
    const due = dueReminderOffsets(offsets, b, now);
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
      baseUrl: await publicBaseUrl(ws),
      adminUrl: adminBaseUrl(ws),
    };
    // Only the nearest due offset gets a message; the others are just marked (avoids a burst after downtime).
    const m = Math.min(...due);
    const hours = Math.max(1, Math.round(m / 60));
    const a = await reminderMail(ctx, false, hours);
    const brief = await briefForBooking(ws, b, et ?? null).catch(() => null);
    const h = await reminderMail({ ...ctx, brief: brief ?? undefined }, true, hours);
    const line = `Reminder: ${et?.title ?? "Meeting"} with ${host.displayName} in ${hours === 1 ? "1 hour" : `${hours} hours`}. ${b.meetingUrl ?? `${ctx.baseUrl}/booking/${b.manageToken}`}`;
    const reminderId = crypto.randomUUID();
    const guestReplyTo = await replyToFor(ws, reminderId, hostUser?.email);
    await Promise.all([
      sendEmail({
        to: [b.attendeeEmail, ...b.guests],
        subject: a.subject,
        text: a.text,
        html: a.html,
        replyTo: guestReplyTo,
        fromName: host.displayName,
      }),
      // Further ahead there is no bell notification to stand in for it: the host's email (with
      // the briefing) goes as before. Within the hour it rides on `notify()` below, realtime first.
      m > 60 && hostUser?.email && (await wantsEmail(ws.id, b.hostUserId, "booking.reminder"))
        ? sendEmail({ to: hostUser.email, subject: h.subject, text: h.text, html: h.html })
        : Promise.resolve(),
      et?.remindByText && b.attendeePhone
        ? textAttendee(b.attendeePhone, line, {
            kind: "booking_reminder",
            attendeeName: b.attendeeName,
            eventTitle: et?.title ?? "Meeting",
            hostName: host.displayName,
            when: `in ${hours === 1 ? "1 hour" : `${hours} hours`} (${fmtDateTime(b.startAt, b.timezone)})`,
            token: b.manageToken,
          })
        : Promise.resolve(),
      m <= 60
        ? notify(ws, b.hostUserId, {
            kind: "booking.reminder",
            title: `${et?.title ?? "Meeting"} with ${b.attendeeName} in ${hours === 1 ? "1 hour" : `${hours} hours`}`,
            body: fmtDateTime(b.startAt, host.timezone ?? ws.timezone),
            link: `/admin/bookings/${b.id}`,
            dedupeKey: `booking:${b.id}:remind:${b.startAt.getTime()}`,
            bookingId: b.id,
            text: `${b.attendeeName} · ${et?.title ?? "Meeting"} in ${hours === 1 ? "1 hour" : `${hours} hours`}. ${b.meetingUrl ?? ""}`.trim(),
            email: { subject: h.subject, text: h.text, html: h.html },
          })
        : Promise.resolve(),
    ]).catch((e) => console.error("[reminders]", e));
    await db()
      .update(schema.bookings)
      .set({ remindersSent: [...b.remindersSent, ...due.map((x) => `r:${x}`)] })
      .where(eq(schema.bookings.id, b.id));
    await trackBooking(
      ws,
      b,
      "email_sent",
      `Reminder (${hours}h) for ${et?.title ?? "meeting"}`,
      { subject: a.subject, body: a.text, sentBy: b.hostUserId },
      { id: reminderId },
    );
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
      baseUrl: await publicBaseUrl(ws),
      adminUrl: adminBaseUrl(ws),
    });
    const followUpId = crypto.randomUUID();
    await sendEmail({
      to: b.attendeeEmail,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      replyTo: await replyToFor(ws, followUpId, hostUser?.email),
      fromName: host?.displayName ?? ws.name,
    }).catch((e) => console.error("[followup]", e));
    await db()
      .update(schema.bookings)
      .set({ remindersSent: [...b.remindersSent, "followup"] })
      .where(eq(schema.bookings.id, b.id));
    await trackBooking(
      ws,
      b,
      "email_sent",
      `Follow-up email: ${mail.subject}`,
      { subject: mail.subject, body: mail.text, sentBy: b.hostUserId },
      { id: followUpId },
    );
    sent++;
  }

  if (only) return sent;
  await expireUnpaidBookings(now).catch((e) => console.error("[payments] expire failed", e));
  await nudgeOverdueTasks(now).catch((e) => console.error("[tasks] nudge failed", e));
  await expireTranscripts(now).catch((e) => console.error("[capture] retention failed", e));
  await expireManualPlans(now).catch((e) => console.error("[ops] plan expiry failed", e));
  await sweepAuditLog(now).catch((e) => console.error("[audit] retention failed", e));
  await sweepPendingFiles(now).catch((e) => console.error("[files] sweep failed", e));
  await sweepFormDrafts(now).catch((e) => console.error("[forms] draft sweep failed", e));
  await pruneNotifications(now).catch((e) => console.error("[notifications] prune failed", e));
  // Realtime first (ADR 0007): held-back channels whose job was lost or never scheduled (inline).
  await sendDueFallbacks(now).catch((e) => console.error("[notifications] fallbacks failed", e));
  await prunePresence(now).catch((e) => console.error("[realtime] presence prune failed", e));
  await purgeTrash(now).catch((e) => console.error("[drive] trash purge failed", e));
  await postDueNotes(now).catch((e) => console.error("[notes] posting failed", e));
  await reconcileSeats(now).catch((e) => console.error("[billing] seat reconcile failed", e));
  await sendTelemetryPing(now).catch((e) => console.error("[telemetry] failed", e));
  await ensureDailyWebhook().catch((e) => console.error("[daily] webhook", e));
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
