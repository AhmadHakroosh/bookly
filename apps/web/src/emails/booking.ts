import type { Booking, EventType, Profile } from "@bookly/db/schema";
import { fmtDateTime } from "@/lib/time";
import { locationLabel } from "@/server/scheduling";

const esc = (s: string) =>
  s.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]!);

export type BookingMailCtx = {
  booking: Booking;
  eventType: EventType | null;
  host: Profile;
  workspaceName: string;
  baseUrl: string;
};

function details({ booking, eventType, host }: BookingMailCtx, tz: string) {
  const when = fmtDateTime(booking.startAt, tz);
  const where = booking.meetingUrl ?? locationLabel(booking.location);
  return {
    when,
    where,
    title: eventType?.title ?? "Meeting",
    duration: Math.round((booking.endAt.getTime() - booking.startAt.getTime()) / 60000),
    hostName: host.displayName,
  };
}

function wrap(
  title: string,
  rows: [string, string][],
  footer: string,
  cta?: { label: string; url: string },
) {
  return `<!doctype html><html><body style="margin:0;background:#fafafa;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#18181b">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="560" style="max-width:560px;background:#fff;border-radius:12px;padding:28px" cellspacing="0" cellpadding="0"><tr><td>
<h1 style="margin:0 0 16px;font-size:22px">${esc(title)}</h1>
<table style="font-size:15px;line-height:1.6">${rows.map(([k, v]) => `<tr><td style="color:#71717a;padding-right:16px;vertical-align:top">${esc(k)}</td><td>${v}</td></tr>`).join("")}</table>
${cta ? `<p style="margin:24px 0 0"><a href="${cta.url}" style="display:inline-block;background:#18181b;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-size:14px">${esc(cta.label)}</a></p>` : ""}
<p style="margin:24px 0 0;color:#71717a;font-size:13px">${footer}</p>
</td></tr></table></td></tr></table></body></html>`;
}

export function attendeeConfirmation(ctx: BookingMailCtx) {
  const d = details(ctx, ctx.booking.timezone);
  const manage = `${ctx.baseUrl}/booking/${ctx.booking.manageToken}`;
  const pending = ctx.booking.status === "pending";
  const subject = pending
    ? `Requested: ${d.title} with ${d.hostName}`
    : `Confirmed: ${d.title} with ${d.hostName}`;
  const text = `${pending ? "Your request was sent to" : "You are booked with"} ${d.hostName}.\n\nWhat: ${d.title} (${d.duration} min)\nWhen: ${d.when}\nWhere: ${d.where}\n\nReschedule or cancel: ${manage}`;
  const html = wrap(
    pending ? "Request sent" : "You're booked",
    [
      ["What", `${esc(d.title)} · ${d.duration} min`],
      ["When", esc(d.when)],
      [
        "Where",
        ctx.booking.meetingUrl
          ? `<a href="${ctx.booking.meetingUrl}">${esc(ctx.booking.meetingUrl)}</a>`
          : esc(d.where),
      ],
      ["With", esc(d.hostName)],
    ],
    pending
      ? "You will get another email once the host confirms."
      : "A calendar invitation is attached.",
    { label: "Reschedule or cancel", url: manage },
  );
  return { subject, text, html };
}

export function hostNotification(ctx: BookingMailCtx) {
  const d = details(ctx, ctx.host.timezone);
  const b = ctx.booking;
  const answers = Object.entries(b.answers).map(([k, v]) => `${k}: ${v}`);
  const subject = `${b.status === "pending" ? "Booking request" : "New booking"}: ${d.title} with ${b.attendeeName}`;
  const text = `${b.attendeeName} (${b.attendeeEmail}) booked ${d.title}.\n\nWhen: ${d.when}\nWhere: ${d.where}${b.notes ? `\n\nNotes: ${b.notes}` : ""}${answers.length ? `\n\n${answers.join("\n")}` : ""}\n\nManage: ${ctx.baseUrl}/admin/bookings`;
  const html = wrap(
    b.status === "pending" ? "Booking request" : "New booking",
    [
      ["Who", `${esc(b.attendeeName)} &lt;${esc(b.attendeeEmail)}&gt;`],
      ["What", `${esc(d.title)} · ${d.duration} min`],
      ["When", esc(d.when)],
      ["Where", esc(d.where)],
      ...(b.notes ? ([["Notes", esc(b.notes)]] as [string, string][]) : []),
      ...answers.map((a) => ["Answer", esc(a)] as [string, string]),
    ],
    "Sent by Bookly.",
    { label: "Open bookings", url: `${ctx.baseUrl}/admin/bookings` },
  );
  return { subject, text, html };
}

export function cancellationMail(ctx: BookingMailCtx, forHost: boolean) {
  const d = details(ctx, forHost ? ctx.host.timezone : ctx.booking.timezone);
  const by = ctx.booking.cancelledBy === "host" ? d.hostName : ctx.booking.attendeeName;
  const subject = `Cancelled: ${d.title} on ${d.when}`;
  const text = `${by} cancelled this meeting.${ctx.booking.cancelReason ? `\n\nReason: ${ctx.booking.cancelReason}` : ""}\n\nWhat: ${d.title}\nWhen: ${d.when}`;
  const html = wrap(
    "Meeting cancelled",
    [
      ["What", esc(d.title)],
      ["When", esc(d.when)],
      ["Cancelled by", esc(by)],
      ...(ctx.booking.cancelReason
        ? ([["Reason", esc(ctx.booking.cancelReason)]] as [string, string][])
        : []),
    ],
    "The calendar entry is withdrawn by the attached update.",
  );
  return { subject, text, html };
}

export function reminderMail(ctx: BookingMailCtx, forHost: boolean, inHours: number) {
  const d = details(ctx, forHost ? ctx.host.timezone : ctx.booking.timezone);
  const subject = `Reminder: ${d.title} ${inHours >= 24 ? "tomorrow" : `in ${inHours} hour${inHours === 1 ? "" : "s"}`}`;
  const text = `${d.title} with ${forHost ? ctx.booking.attendeeName : d.hostName}\nWhen: ${d.when}\nWhere: ${d.where}`;
  const html = wrap(
    "Upcoming meeting",
    [
      ["What", esc(d.title)],
      ["When", esc(d.when)],
      [
        "Where",
        ctx.booking.meetingUrl
          ? `<a href="${ctx.booking.meetingUrl}">${esc(ctx.booking.meetingUrl)}</a>`
          : esc(d.where),
      ],
    ],
    forHost ? "" : `Need to change it? ${ctx.baseUrl}/booking/${ctx.booking.manageToken}`,
  );
  return { subject, text, html };
}
