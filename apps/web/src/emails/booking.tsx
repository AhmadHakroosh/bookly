import type { Booking, EventType, Profile } from "@bookly/db/schema";
import { Text } from "@react-email/components";
import { formatPhone } from "@/lib/phone";
import { attendeeJoinUrl } from "@/lib/meet-link";
import { fmtDateTime } from "@/lib/time";
import { captureEnabled } from "@/server/transcripts";
import { locationLabel } from "@/server/scheduling";
import { fillEmailTemplate, resolveEmailTemplate, type EmailTemplateOverrides } from "./defaults";
import { styles, type EmailBrand } from "./layout";
import { renderEmail } from "./render";
import { BookingEmail, HostEmail, LetterEmail } from "./templates";

export type BookingMailCtx = {
  booking: Booking;
  eventType: EventType | null;
  host: Profile;
  workspaceName: string;
  baseUrl: string;
  /** Where host-facing buttons point; defaults to `baseUrl`. */
  adminUrl?: string;
  brand: EmailBrand;
  /** The workspace's own wording, when set. */
  templates?: EmailTemplateOverrides;
  /** Set when the booking is one occurrence of a recurring series. */
  series?: { index: number; count: number; dates: Date[] };
  /** Host-only: the pre-meeting briefing, included in reminders. */
  brief?: string;
};

export type Mail = { subject: string; text: string; html: string };

function seriesLines(ctx: BookingMailCtx, tz: string): string[] {
  if (!ctx.series) return [];
  return ctx.series.dates.map((d) => fmtDateTime(d, tz));
}

function details({ booking, eventType, host }: BookingMailCtx, tz: string) {
  const when = fmtDateTime(booking.startAt, tz);
  const conferencing = ["daily", "google_meet", "zoom", "teams"].includes(booking.location.type);
  const where =
    booking.meetingUrl ??
    (conferencing
      ? `${locationLabel(booking.location)} · the link will be emailed before the meeting`
      : locationLabel(booking.location));
  return {
    when,
    where,
    title: eventType?.title ?? "Meeting",
    duration: Math.round((booking.endAt.getTime() - booking.startAt.getTime()) / 60000),
    hostName: host.displayName,
  };
}

const manageUrl = (ctx: BookingMailCtx) => `${ctx.baseUrl}/booking/${ctx.booking.manageToken}`;
const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

/** Placeholder values for the customisable guest emails. */
function vars(ctx: BookingMailCtx, tz: string, extra: Record<string, string> = {}) {
  const d = details(ctx, tz);
  const dates = seriesLines(ctx, tz);
  return {
    name: firstName(ctx.booking.attendeeName),
    host: d.hostName,
    event: d.title,
    when: dates.length ? `${dates.length} sessions starting ${dates[0]}` : d.when,
    where: d.where,
    duration: `${d.duration} min`,
    bookingUrl: manageUrl(ctx),
    workspace: ctx.workspaceName,
    ...extra,
  };
}

function whenRow(ctx: BookingMailCtx, tz: string): [string, React.ReactNode] {
  const dates = seriesLines(ctx, tz);
  const d = details(ctx, tz);
  return [
    "When",
    dates.length ? (
      <>
        {dates.length} sessions
        {dates.map((x) => (
          <span key={x}>
            <br />
            {x}
          </span>
        ))}
      </>
    ) : (
      d.when
    ),
  ];
}

function whereRow(
  ctx: BookingMailCtx,
  tz: string,
  audience: "attendee" | "host" = "attendee",
): [string, React.ReactNode] {
  const d = details(ctx, tz);
  const url = audience === "attendee" ? attendeeJoinUrl(ctx.booking) : ctx.booking.meetingUrl;
  return [
    "Where",
    url ? (
      <a href={url} style={{ color: "#18181b" }}>
        {url}
      </a>
    ) : (
      d.where
    ),
  ];
}

export async function attendeeConfirmation(ctx: BookingMailCtx): Promise<Mail> {
  const tz = ctx.booking.timezone;
  const d = details(ctx, tz);
  const pending = ctx.booking.status === "pending";
  const t = pending
    ? {
        subject: "Requested: {event} with {host}",
        body: "Hi {name},\n\nYour request was sent to {host}. You'll get another email as soon as they confirm.",
      }
    : resolveEmailTemplate("confirmation", ctx.templates);
  const { subject, body } = fillEmailTemplate(t, vars(ctx, tz));
  const locType = ctx.booking.location.type;
  const transcribed = captureEnabled(ctx.booking, ctx.eventType ?? null);
  const transcribedNote =
    (locType === "daily"
      ? "This call is transcribed so both sides get notes afterwards. "
      : "A notetaker joins the call to transcribe it, so both sides get notes afterwards. ") +
    "Everyone who joins is told at the start, and you can delete the transcript from your booking page.";
  const { html, text } = await renderEmail(
    <BookingEmail
      brand={ctx.brand}
      title={pending ? "Request sent" : "You're booked"}
      preview={subject}
      body={body}
      rows={[
        ["What", `${d.title} · ${d.duration} min`],
        whenRow(ctx, tz),
        whereRow(ctx, tz),
        ["With", d.hostName],
      ]}
      cta={{ href: manageUrl(ctx), label: "Reschedule or cancel" }}
      note={
        (pending ? "" : "A calendar invitation is attached. ") +
        (transcribed ? transcribedNote : "")
      }
      signedBy={d.hostName}
    />,
  );
  return { subject, text, html };
}

export async function hostNotification(ctx: BookingMailCtx): Promise<Mail> {
  const tz = ctx.host.timezone;
  const d = details(ctx, tz);
  const b = ctx.booking;
  const answers = Object.entries(b.answers).map(([k, v]) => `${k}: ${v}`);
  const dates = seriesLines(ctx, tz);
  const subject = `${b.status === "pending" ? "Booking request" : "New booking"}: ${d.title} with ${b.attendeeName}${dates.length ? ` (${dates.length} sessions)` : ""}`;
  const { html, text } = await renderEmail(
    <HostEmail
      brand={ctx.brand}
      title={b.status === "pending" ? "Booking request" : "New booking"}
      preview={subject}
      intro={`${b.attendeeName} (${b.attendeeEmail}) ${b.status === "pending" ? "asked for" : "booked"} ${d.title}.`}
      rows={[
        [
          "Who",
          `${b.attendeeName} · ${b.attendeeEmail}${b.attendeePhone ? ` · ${formatPhone(b.attendeePhone)}` : ""}`,
        ],
        ["What", `${d.title} · ${d.duration} min`],
        whenRow(ctx, tz),
        ["Where", d.where],
        ...(b.notes ? ([["Notes", b.notes]] as [string, string][]) : []),
        ...answers.map((a) => ["Answer", a] as [string, string]),
      ]}
      cta={{ href: `${ctx.adminUrl ?? ctx.baseUrl}/admin/bookings`, label: "Open bookings" }}
    />,
  );
  return { subject, text, html };
}

export async function cancellationMail(ctx: BookingMailCtx, forHost: boolean): Promise<Mail> {
  const tz = forHost ? ctx.host.timezone : ctx.booking.timezone;
  const d = details(ctx, tz);
  const by = ctx.booking.cancelledBy === "host" ? d.hostName : ctx.booking.attendeeName;
  const dates = seriesLines(ctx, tz);
  const rows: [string, React.ReactNode][] = [
    ["What", d.title],
    whenRow(ctx, tz),
    ["Cancelled by", by],
    ...(ctx.booking.cancelReason
      ? ([["Reason", ctx.booking.cancelReason]] as [string, string][])
      : []),
  ];
  const title = dates.length ? "Sessions cancelled" : "Meeting cancelled";
  if (forHost) {
    const subject = dates.length
      ? `Cancelled: ${d.title}, ${dates.length} remaining sessions`
      : `Cancelled: ${d.title} on ${d.when}`;
    const { html, text } = await renderEmail(
      <HostEmail
        brand={ctx.brand}
        title={title}
        preview={subject}
        intro={`${by} cancelled ${dates.length ? "the remaining sessions" : "this meeting"}. The calendar entry is withdrawn by the attached update.`}
        rows={rows}
        cta={{ href: `${ctx.adminUrl ?? ctx.baseUrl}/admin/bookings`, label: "Open bookings" }}
      />,
    );
    return { subject, text, html };
  }
  const { subject, body } = fillEmailTemplate(
    resolveEmailTemplate("cancellation", ctx.templates),
    vars(ctx, tz),
  );
  const { html, text } = await renderEmail(
    <BookingEmail
      brand={ctx.brand}
      title={title}
      preview={subject}
      body={body}
      rows={rows}
      cta={{ href: `${ctx.baseUrl}/${ctx.host.username}`, label: "Book another time" }}
      note="The calendar entry is withdrawn by the attached update."
      signedBy={d.hostName}
    />,
  );
  return { subject, text, html };
}

/** Post-meeting follow-up from the event type's template (placeholders replaced). */
export async function followUpMail(ctx: BookingMailCtx): Promise<Mail> {
  const d = details(ctx, ctx.booking.timezone);
  const fu = ctx.eventType?.followUp ?? {};
  const fill = (s: string) =>
    s
      .replaceAll("{name}", firstName(ctx.booking.attendeeName))
      .replaceAll("{host}", d.hostName)
      .replaceAll("{event}", d.title)
      .replaceAll("{bookingUrl}", manageUrl(ctx));
  const subject = fill(fu.subject?.trim() || `Thanks for your time, {name}`);
  const body = fill(
    fu.body?.trim() ||
      `Hi {name},\n\nThanks for the {event} today. If anything is unclear or you want to continue the conversation, just reply to this email.\n\n{host}`,
  );
  const { html, text } = await renderEmail(
    <LetterEmail
      brand={ctx.brand}
      preview={subject}
      title={subject}
      body={body}
      signedBy={d.hostName}
    />,
  );
  return { subject, text, html };
}

export async function reminderMail(
  ctx: BookingMailCtx,
  forHost: boolean,
  inHours: number,
): Promise<Mail> {
  const tz = forHost ? ctx.host.timezone : ctx.booking.timezone;
  const d = details(ctx, tz);
  const relative = inHours >= 24 ? "tomorrow" : `in ${inHours} hour${inHours === 1 ? "" : "s"}`;
  const rows: [string, React.ReactNode][] = [
    ["What", d.title],
    ["When", d.when],
    whereRow(ctx, tz, "host"),
  ];
  if (forHost) {
    const subject = `Reminder: ${d.title} with ${ctx.booking.attendeeName} ${relative}`;
    const { html, text } = await renderEmail(
      <HostEmail
        brand={ctx.brand}
        title="Upcoming meeting"
        preview={subject}
        intro={`${d.title} with ${ctx.booking.attendeeName} is ${relative}.`}
        rows={[...rows, ["With", `${ctx.booking.attendeeName} · ${ctx.booking.attendeeEmail}`]]}
        cta={
          ctx.booking.meetingUrl
            ? { href: ctx.booking.meetingUrl, label: "Join the call" }
            : { href: `${ctx.adminUrl ?? ctx.baseUrl}/admin/bookings`, label: "Open bookings" }
        }
        extra={
          ctx.brief ? (
            <>
              <Text style={{ ...styles.label, marginTop: "4px" }}>Briefing</Text>
              <Text style={{ ...styles.p, whiteSpace: "pre-wrap" }}>{ctx.brief}</Text>
            </>
          ) : undefined
        }
      />,
    );
    return { subject, text, html };
  }
  const { subject, body } = fillEmailTemplate(
    resolveEmailTemplate("reminder", ctx.templates),
    vars(ctx, tz, { relative }),
  );
  const { html, text } = await renderEmail(
    <BookingEmail
      brand={ctx.brand}
      title="Upcoming meeting"
      preview={subject}
      body={body}
      rows={rows}
      cta={
        ctx.booking.meetingUrl
          ? { href: ctx.booking.meetingUrl, label: "Join the call" }
          : { href: manageUrl(ctx), label: "View booking" }
      }
      note={`Need to change it? ${manageUrl(ctx)}`}
      signedBy={d.hostName}
    />,
  );
  return { subject, text, html };
}

/** A letter from the host to a contact: proposals, payment requests, client recaps. */
export async function letterMail(input: {
  brand: EmailBrand;
  subject: string;
  body: string;
  signedBy: string;
  cta?: { href: string; label: string };
  /** Sender's postal address and unsubscribe link (commercial email from a host). */
  address?: string;
  unsubscribeUrl?: string;
}): Promise<Mail> {
  const { html, text } = await renderEmail(
    <LetterEmail
      brand={input.brand}
      preview={input.subject}
      title={input.subject}
      body={input.body}
      cta={input.cta}
      signedBy={input.signedBy}
      address={input.address}
      unsubscribeUrl={input.unsubscribeUrl}
    />,
  );
  return { subject: input.subject, text, html };
}
