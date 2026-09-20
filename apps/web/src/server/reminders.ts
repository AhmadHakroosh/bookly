import "server-only";
import { and, eq, gte, inArray, lte, schema, sql } from "@bookly/db";
import { sendEmail } from "@bookly/email";
import { db } from "@/lib/db";
import { reminderMail } from "@/emails/booking";
import { notifyHost, sendText } from "./notify";
import { expireUnpaidBookings } from "./payments";
import { baseUrl, getProfileByUser } from "./scheduling";

const WINDOWS = [
  { key: "24h", hours: 24 },
  { key: "1h", hours: 1 },
];

/** Sends 24h and 1h reminders for confirmed bookings. Idempotent via `reminders_sent`. */
export async function sendDueReminders(now = new Date()): Promise<number> {
  let sent = 0;
  for (const w of WINDOWS) {
    const from = new Date(now.getTime() + (w.hours - 0.25) * 3600_000);
    const to = new Date(now.getTime() + (w.hours + 0.25) * 3600_000);
    const due = await db()
      .select()
      .from(schema.bookings)
      .where(
        and(
          eq(schema.bookings.status, "confirmed"),
          gte(schema.bookings.startAt, from),
          lte(schema.bookings.startAt, to),
          sql`not (${schema.bookings.remindersSent} ? ${w.key})`,
        ),
      )
      .limit(200);
    for (const b of due) {
      const [ws, et, host, hostUser] = await Promise.all([
        db().query.workspaces.findFirst({ where: eq(schema.workspaces.id, b.workspaceId) }),
        b.eventTypeId
          ? db().query.eventTypes.findFirst({ where: eq(schema.eventTypes.id, b.eventTypeId) })
          : null,
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
        baseUrl: baseUrl(),
      };
      const a = reminderMail(ctx, false, w.hours);
      const h = reminderMail(ctx, true, w.hours);
      const line = `Reminder: ${et?.title ?? "Meeting"} with ${host.displayName} in ${w.hours === 1 ? "1 hour" : `${w.hours} hours`}. ${b.meetingUrl ?? `${baseUrl()}/booking/${b.manageToken}`}`;
      await Promise.all([
        sendEmail({ to: b.attendeeEmail, subject: a.subject, text: a.text, html: a.html }),
        hostUser?.email
          ? sendEmail({ to: hostUser.email, subject: h.subject, text: h.text, html: h.html })
          : Promise.resolve(),
        et?.remindByText && b.attendeePhone
          ? sendText("sms", b.attendeePhone.replace(/[\s()-]/g, ""), line).then((ok) =>
              ok ? undefined : sendText("whatsapp", b.attendeePhone!.replace(/[\s()-]/g, ""), line),
            )
          : Promise.resolve(),
        w.hours === 1
          ? notifyHost(b.hostUserId, "reminder1h", {
              subject: h.subject,
              text: `${b.attendeeName} · ${et?.title ?? "Meeting"} in 1 hour. ${b.meetingUrl ?? ""}`.trim(),
            })
          : Promise.resolve(),
      ]).catch((e) => console.error("[reminders]", e));
      await db()
        .update(schema.bookings)
        .set({ remindersSent: [...b.remindersSent, w.key] })
        .where(eq(schema.bookings.id, b.id));
      sent++;
    }
  }
  await expireUnpaidBookings(now).catch((e) => console.error("[payments] expire failed", e));
  // Mark finished meetings as completed.
  await db()
    .update(schema.bookings)
    .set({ status: "completed" })
    .where(
      and(
        inArray(schema.bookings.status, ["confirmed"]),
        lte(schema.bookings.endAt, new Date(now.getTime() - 3600_000)),
      ),
    );
  return sent;
}
