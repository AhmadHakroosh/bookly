import { captureEnabled } from "./transcripts";
import { attendeeJoinUrl } from "@/lib/meet-link";
import "server-only";
import { and, asc, eq, gt, inArray, ne, schema } from "@bookly/db";
import type { Booking, EventType, Profile, Workspace } from "@bookly/db/schema";
import { sendEmail } from "@bookly/email";
import { db } from "@/lib/db";
import {
  attendeeConfirmation,
  cancellationMail,
  hostNotification,
  type BookingMailCtx,
} from "@/emails/booking";
import { fmtDateTime } from "@/lib/time";
import { buildIcsCalendar, type IcsEvent } from "./ics";
import { deprovisionBooking, provisionBooking, syncEventAttendees } from "./integrations";
import { serializeBooking } from "./api";
import { notifyHost } from "./notify";
import { isPaid, paymentsReady, recordPayment, refundBooking } from "./payments";
import { notifyWaitlist } from "./waitlist";
import { emitEvent } from "./webhooks";
import { brandFor } from "@/emails/brand";
import { scheduleBookingJobs } from "./jobs";
import { isBlocked } from "./abuse";
import { toE164 } from "@/lib/phone";
import { priorityForEmail, trackBooking } from "./contacts";
import { refreshWorkspace } from "./cache";
import { hasFeature, assertBookingQuota, LimitError } from "./limits";
import { occurrences, recurrenceOf } from "./recurrence";
import {
  baseUrl,
  eventLocations,
  getProfileByUser,
  locationLabel,
  newToken,
  pickHost,
  pickLocation,
} from "./scheduling";

export type BookingInput = {
  start: Date;
  timezone: string;
  name: string;
  email: string;
  phone?: string | null;
  notes?: string | null;
  answers: Record<string, string>;
  rescheduleToken?: string | null;
  /** Existing customers may use focus blocks and exceed the weekly budget. */
  priority?: boolean;
  /** Attendee's answer to the transcription question (event types with autoCapture = ask). */
  /** true when the attendee ticked the box, or booked an event type that is always transcribed. */
  captureConsent?: boolean | null;
  /** Where to meet, chosen from the event type's locations (type only). */
  location?: string | null;
  /** What the attendee supplied for that location: their phone number (E.164) or address. */
  locationValue?: string | null;
};

export class BookingError extends Error {}

/** Booking answers keyed by the question's label, for timelines and briefs. */
function labelledAnswers(eventType: EventType, answers: Record<string, string>) {
  return Object.fromEntries(
    eventType.questions.map((q) => [q.label, (answers[q.id] ?? "").trim()]).filter(([, v]) => v),
  );
}

/** What `createBooking` returns: the (first) booking plus, for a series, the dates that could not be booked. */
export type BookingResult = Booking & { skipped?: Date[] };

/** Every booking of a series, in order (cancelled ones included so indexes stay meaningful). */
export async function bookingSeries(booking: Pick<Booking, "seriesId">): Promise<Booking[]> {
  if (!booking.seriesId) return [];
  return db()
    .select()
    .from(schema.bookings)
    .where(eq(schema.bookings.seriesId, booking.seriesId))
    .orderBy(asc(schema.bookings.seriesIndex));
}

async function seriesCtx(booking: Booking) {
  if (!booking.seriesId) return undefined;
  const all = (await bookingSeries(booking)).filter((b) => b.status !== "cancelled");
  return {
    index: booking.seriesIndex ?? 1,
    count: booking.seriesCount ?? all.length,
    dates: all.map((b) => b.startAt),
  };
}

async function mailCtx(
  booking: Booking,
  eventType: EventType | null,
  workspace: Workspace,
): Promise<BookingMailCtx> {
  const host = (await getProfileByUser(workspace.id, booking.hostUserId))!;
  return {
    booking,
    eventType,
    host,
    workspaceName: workspace.name,
    baseUrl: baseUrl(),
    brand: brandFor(workspace),
    templates: workspace.settings.templates,
  };
}

function icsEvent(
  ctx: BookingMailCtx,
  b: Booking,
  method: "REQUEST" | "CANCEL",
  sequence = 0,
): IcsEvent {
  return {
    uid: `${b.id}@bookly`,
    start: b.startAt,
    end: b.endAt,
    summary: `${ctx.eventType?.title ?? "Meeting"}: ${ctx.host.displayName} and ${b.attendeeName}`,
    description: [
      attendeeJoinUrl(b) ?? locationLabel(b.location),
      captureEnabled(b, ctx.eventType ?? null)
        ? "This call is transcribed so both sides get notes afterwards. Everyone who joins is told at the start."
        : "",
      `Manage: ${ctx.baseUrl}/booking/${b.manageToken}`,
    ]
      .filter(Boolean)
      .join("\n\n"),
    location: attendeeJoinUrl(b) ?? locationLabel(b.location),
    url: `${ctx.baseUrl}/booking/${b.manageToken}`,
    organizer: {
      name: ctx.host.displayName,
      email: (ctx.host as Profile & { email?: string }).email ?? "noreply@bookly",
    },
    attendees: [{ name: b.attendeeName, email: b.attendeeEmail }],
    method,
    sequence,
    status: method === "CANCEL" ? "CANCELLED" : "CONFIRMED",
  };
}

/** The invite for a booking; for a series every (non-cancelled) occurrence is included. */
async function icsFor(ctx: BookingMailCtx, method: "REQUEST" | "CANCEL", sequence = 0) {
  const members = ctx.series
    ? (await bookingSeries(ctx.booking)).filter((b) => b.status !== "cancelled")
    : [ctx.booking];
  return buildIcsCalendar(
    members.map((b) => icsEvent(ctx, b, method, sequence)),
    method,
  );
}

async function hostEmail(userId: string) {
  const u = await db().query.users.findFirst({
    where: eq(schema.users.id, userId),
    columns: { email: true },
  });
  return u?.email ?? null;
}

/** Another attendee's booking in the same group session, if the session already exists. */
async function sessionSibling(booking: Booking, eventType: EventType | null) {
  if (!eventType || eventType.seats <= 1) return null;
  return (
    (await db().query.bookings.findFirst({
      where: and(
        eq(schema.bookings.eventTypeId, eventType.id),
        eq(schema.bookings.hostUserId, booking.hostUserId),
        eq(schema.bookings.startAt, booking.startAt),
        eq(schema.bookings.status, "confirmed"),
        ne(schema.bookings.id, booking.id),
      ),
      orderBy: asc(schema.bookings.createdAt),
    })) ?? null
  );
}

/**
 * Puts every confirmed attendee of a group session on the calendar event held by the session's
 * owner booking (the one carrying `externalEventIds`). Best-effort.
 */
async function syncGroupGuests(booking: Booking, eventType: EventType | null) {
  if (!eventType || eventType.seats <= 1) return;
  const members = await db()
    .select()
    .from(schema.bookings)
    .where(
      and(
        eq(schema.bookings.eventTypeId, eventType.id),
        eq(schema.bookings.hostUserId, booking.hostUserId),
        eq(schema.bookings.startAt, booking.startAt),
        eq(schema.bookings.status, "confirmed"),
      ),
    )
    .orderBy(asc(schema.bookings.createdAt));
  const owner = members.find((m) => Object.keys(m.externalEventIds).length);
  if (!owner) return;
  await syncEventAttendees(
    owner,
    members.map((m) => ({ name: m.attendeeName, email: m.attendeeEmail })),
  ).catch((e) => console.error("[booking] guest sync failed", e));
}

/**
 * Creates the meeting link + calendar events and stores them on the booking (best-effort).
 * Group sessions share one meeting: later attendees copy the first booking's link, and the
 * calendar event stays owned by that first booking with every attendee as a guest.
 */
async function provision(workspace: Workspace, booking: Booking, eventType: EventType | null) {
  const sibling = await sessionSibling(booking, eventType);
  if (sibling?.meetingUrl) {
    const [updated] = await db()
      .update(schema.bookings)
      .set({
        meetingUrl: sibling.meetingUrl,
        meetingProvider: sibling.meetingProvider,
        meetingRef: sibling.meetingRef,
        location: sibling.location,
      })
      .where(eq(schema.bookings.id, booking.id))
      .returning();
    await syncGroupGuests(updated ?? booking, eventType);
    return updated ?? booking;
  }
  const host = await getProfileByUser(workspace.id, booking.hostUserId);
  const email = await hostEmail(booking.hostUserId);
  const p = await provisionBooking(booking, eventType, {
    name: host?.displayName ?? workspace.name,
    email,
  });
  const [updated] = await db()
    .update(schema.bookings)
    .set(p)
    .where(eq(schema.bookings.id, booking.id))
    .returning();
  return updated ?? booking;
}

/**
 * Plans the occurrences of a recurring event type from `start`: which dates can be booked and
 * which are skipped because the host is busy. Regular event types plan a single occurrence.
 */
export async function planSeries(
  eventType: EventType,
  attendeeTz: string,
  start: Date,
  priority = false,
): Promise<{ start: Date; hostUserId: string | null }[]> {
  const rule = recurrenceOf(eventType.recurrence);
  const starts = rule ? occurrences(start, attendeeTz, rule) : [start];
  return Promise.all(
    starts.map(async (s, i) => ({
      start: s,
      hostUserId: await pickHost(eventType, attendeeTz, s, { horizon: i === 0, priority }),
    })),
  );
}

/**
 * Validates the slot, stores the booking, provisions meeting/calendar, and emails both sides.
 * Recurring event types book the whole series at once (occurrences the host cannot take are
 * skipped and reported via `skipped`); a reschedule moves a single occurrence. Paid series are
 * held as `awaiting_payment` and confirmed together by one Checkout.
 */
export async function createBooking(
  workspace: Workspace,
  eventType: EventType,
  input: BookingInput,
): Promise<BookingResult> {
  for (const q of eventType.questions) {
    if (q.required && !input.answers[q.id]?.trim())
      throw new BookingError(`Please answer: ${q.label}`);
  }
  if (isBlocked(input.email, workspace.settings.blockedEmails as string[] | undefined))
    throw new BookingError("Bookings from this email address are not accepted.");
  if (!input.rescheduleToken) {
    try {
      await assertBookingQuota(workspace);
    } catch (e) {
      if (e instanceof LimitError) throw new BookingError(e.message);
      throw e;
    }
  }
  const needsPayment = isPaid(eventType) && paymentsReady(workspace);
  const status: Booking["status"] = needsPayment
    ? "awaiting_payment"
    : eventType.requiresConfirmation
      ? "pending"
      : "confirmed";

  let prev: Booking | null = null;
  if (input.rescheduleToken) {
    prev =
      (await db().query.bookings.findFirst({
        where: eq(schema.bookings.manageToken, input.rescheduleToken),
      })) ?? null;
    if (prev?.status === "cancelled") prev = null;
  }
  // Where to meet: the attendee's pick, else the only option, else what the rescheduled
  // booking had (when the event type still offers it).
  const video = { video: hasFeature(workspace, "booklyVideo") };
  let location =
    pickLocation(eventType, input.location, video) ??
    (prev && eventLocations(eventType, video).some((l) => l.type === prev!.location.type)
      ? prev.location
      : null) ??
    (eventLocations(eventType, video).length === 1 ? eventLocations(eventType, video)[0]! : null);
  if (!location) throw new BookingError("Please choose how you want to meet.");
  // A phone call needs the attendee's number; an in-person meeting with no host address needs
  // theirs. The value travels with the booking so every invitation and page shows it.
  if (location.type === "phone") {
    const phone = input.phone ? toE164(input.phone) : null;
    if (!phone) throw new BookingError("Please enter a phone number we can call.");
    input = { ...input, phone };
    location = { ...location, value: phone };
  } else if (location.type === "in_person" && !location.value) {
    const address = input.locationValue?.trim().slice(0, 300);
    if (!address) throw new BookingError("Please enter the address to meet at.");
    location = { ...location, value: address };
  }

  const single = !!prev || !recurrenceOf(eventType.recurrence);
  const priority = input.priority ?? (await priorityForEmail(workspace.id, input.email));
  const plan = single
    ? [
        {
          start: input.start,
          hostUserId: await pickHost(eventType, input.timezone, input.start, { priority }),
        },
      ]
    : await planSeries(eventType, input.timezone, input.start, priority);
  if (!plan[0]?.hostUserId)
    throw new BookingError("That time is no longer available. Please pick another slot.");
  const bookable = plan.filter((p): p is { start: Date; hostUserId: string } => !!p.hostUserId);
  const skipped = plan.filter((p) => !p.hostUserId).map((p) => p.start);

  const rescheduledFromId = prev?.id ?? null;
  if (prev) {
    await db()
      .update(schema.bookings)
      .set({ status: "rescheduled" })
      .where(eq(schema.bookings.id, prev.id));
    await deprovisionBooking(prev);
  }

  // A reschedule keeps its place in the series; a new series gets a fresh id.
  const seriesId = prev?.seriesId ?? (bookable.length > 1 ? crypto.randomUUID() : null);
  const rows = await db()
    .insert(schema.bookings)
    .values(
      bookable.map((p, i) => ({
        workspaceId: workspace.id,
        eventTypeId: eventType.id,
        hostUserId: p.hostUserId,
        startAt: p.start,
        endAt: new Date(p.start.getTime() + eventType.durationMin * 60_000),
        timezone: input.timezone,
        attendeeName: input.name.trim().slice(0, 120),
        attendeeEmail: input.email.trim().toLowerCase(),
        attendeePhone: input.phone?.trim() || null,
        notes: input.notes?.trim() || null,
        answers: input.answers,
        status,
        manageToken: newToken(),
        rescheduledFromId,
        seriesId,
        seriesIndex: prev?.seriesIndex ?? (seriesId ? i + 1 : null),
        seriesCount: prev?.seriesCount ?? (seriesId ? bookable.length : null),
        captureConsent: input.captureConsent ?? prev?.captureConsent ?? null,
        captureConsentAt: input.captureConsent
          ? new Date()
          : input.captureConsent === false
            ? null
            : (prev?.captureConsentAt ?? null),
        location,
        amountCents: needsPayment ? eventType.priceCents : null,
        currency: needsPayment ? (eventType.currency ?? "usd") : null,
      })),
    )
    .returning();
  const first = rows[0]!;

  // Paid bookings are finalised by the Stripe webhook (see finalizePaidBooking).
  if (needsPayment) {
    await trackBooking(
      workspace,
      first,
      "booked",
      `Started paid booking of ${eventType.title} for ${fmtDateTime(first.startAt, first.timezone)}`,
      { answers: labelledAnswers(eventType, input.answers), awaitingPayment: true },
    );
    return { ...first, skipped };
  }
  await trackBooking(
    workspace,
    first,
    rescheduledFromId ? "rescheduled" : "booked",
    `${rescheduledFromId ? "Rescheduled" : "Booked"} ${eventType.title}${rows.length > 1 ? ` (${rows.length} sessions)` : ""} for ${fmtDateTime(first.startAt, first.timezone)}`,
    {
      answers: labelledAnswers(eventType, input.answers),
      notes: input.notes?.trim() || null,
      sessions: rows.length,
    },
  );
  // Every occurrence is provisioned and announced to webhooks; people are emailed once.
  const finalized = await finalizeBooking(workspace, first, eventType, rescheduledFromId);
  for (const b of rows.slice(1)) await finalizeBooking(workspace, b, eventType, null, false);
  return { ...finalized, skipped };
}

/**
 * Second half of booking creation: provisions meeting + calendar, sends emails, pings the
 * host, emits webhooks. Runs immediately for free bookings and after payment for paid ones.
 */
/**
 * Stripe said a Checkout was paid: records the payment on the booking and, for a series, on
 * every occurrence the session covered, then finalises them (people are emailed once).
 */
export async function finalizePaidBooking(bookingId: string, paymentIntentId: string | null) {
  const paid = await recordPayment(bookingId, paymentIntentId);
  if (!paid || paid.status !== "awaiting_payment") return null;
  const [ws, et] = await Promise.all([
    db().query.workspaces.findFirst({ where: eq(schema.workspaces.id, paid.workspaceId) }),
    paid.eventTypeId
      ? db().query.eventTypes.findFirst({ where: eq(schema.eventTypes.id, paid.eventTypeId) })
      : null,
  ]);
  if (!ws || !et) return null;
  const siblings = paid.seriesId
    ? (await bookingSeries(paid)).filter((b) => b.id !== paid.id && b.status === "awaiting_payment")
    : [];
  for (const s of siblings) await recordPayment(s.id, paymentIntentId);
  const first = await finalizeBooking(ws, paid, et);
  for (const s of siblings)
    await finalizeBooking(ws, { ...s, paymentStatus: "paid" }, et, null, false);
  return first;
}

export async function finalizeBooking(
  workspace: Workspace,
  booking: Booking,
  eventType: EventType,
  rescheduledFromId: string | null = booking.rescheduledFromId,
  notify = true,
): Promise<Booking> {
  if (booking.status === "awaiting_payment") {
    const [b] = await db()
      .update(schema.bookings)
      .set({ status: eventType.requiresConfirmation ? "pending" : "confirmed" })
      .where(eq(schema.bookings.id, booking.id))
      .returning();
    booking = b!;
  }
  if (booking.status === "confirmed") booking = await provision(workspace, booking, eventType);
  if (notify) {
    await notifyCreated(workspace, booking, eventType);
    await trackBooking(
      workspace,
      booking,
      "email_sent",
      `Confirmation email for ${eventType.title}`,
    );
    const when = fmtDateTime(
      booking.startAt,
      (await getProfileByUser(workspace.id, booking.hostUserId))?.timezone ?? workspace.timezone,
    );
    const series = booking.seriesCount ? ` (${booking.seriesCount} sessions)` : "";
    void notifyHost(booking.hostUserId, "onBooking", {
      subject: `New booking: ${eventType.title}`,
      text: `${booking.attendeeName} booked ${eventType.title}${series} on ${when}${booking.status === "pending" ? " (needs your confirmation)" : ""}. ${baseUrl()}/admin/bookings`,
    });
  }
  const payload = { booking: serializeBooking(booking, { eventType }) };
  emitEvent(workspace.id, "booking.created", payload);
  if (booking.status === "confirmed") void scheduleFor(booking, eventType);
  if (rescheduledFromId)
    emitEvent(workspace.id, "booking.rescheduled", {
      ...payload,
      previousBookingId: rescheduledFromId,
    });
  refreshWorkspace(workspace.id);
  return booking;
}

async function notifyCreated(workspace: Workspace, booking: Booking, eventType: EventType | null) {
  const ctx = {
    ...(await mailCtx(booking, eventType, workspace)),
    series: await seriesCtx(booking),
  };
  const ics = await icsFor(ctx, "REQUEST");
  const a = await attendeeConfirmation(ctx);
  const h = await hostNotification(ctx);
  const hostTo = await hostEmail(booking.hostUserId);
  await Promise.all([
    sendEmail({
      to: booking.attendeeEmail,
      subject: a.subject,
      text: a.text,
      html: a.html,
      replyTo: hostTo ?? undefined,
      fromName: ctx.host.displayName,
      attachments:
        booking.status === "confirmed"
          ? [{ filename: "invite.ics", content: ics, contentType: "text/calendar; method=REQUEST" }]
          : [],
    }),
    hostTo
      ? sendEmail({
          to: hostTo,
          subject: h.subject,
          text: h.text,
          html: h.html,
          replyTo: booking.attendeeEmail,
          attachments: [
            { filename: "invite.ics", content: ics, contentType: "text/calendar; method=REQUEST" },
          ],
        })
      : Promise.resolve(),
  ]).catch((e) => console.error("[booking] email failed", e));
}

export async function confirmBooking(workspace: Workspace, bookingId: string) {
  const b = await db().query.bookings.findFirst({
    where: and(eq(schema.bookings.id, bookingId), eq(schema.bookings.workspaceId, workspace.id)),
  });
  if (!b || b.status !== "pending") return null;
  let [updated] = await db()
    .update(schema.bookings)
    .set({ status: "confirmed" })
    .where(eq(schema.bookings.id, b.id))
    .returning();
  const et = b.eventTypeId
    ? await db().query.eventTypes.findFirst({ where: eq(schema.eventTypes.id, b.eventTypeId) })
    : null;
  updated = await provision(workspace, updated!, et ?? null);
  await trackBooking(
    workspace,
    updated!,
    "confirmed",
    `Confirmed ${et?.title ?? "meeting"} for ${fmtDateTime(updated!.startAt, updated!.timezone)}`,
  );
  emitEvent(workspace.id, "booking.confirmed", {
    booking: serializeBooking(updated!, { eventType: et ?? null }),
  });
  void scheduleFor(updated!, et ?? null);
  const ctx = await mailCtx(updated!, et ?? null, workspace);
  const a = await attendeeConfirmation(ctx);
  await sendEmail({
    to: b.attendeeEmail,
    subject: a.subject,
    text: a.text,
    html: a.html,
    attachments: [
      {
        filename: "invite.ics",
        content: await icsFor(ctx, "REQUEST", 1),
        contentType: "text/calendar; method=REQUEST",
      },
    ],
  }).catch(() => {});
  refreshWorkspace(workspace.id);
  return updated!;
}

/**
 * Cancels one booking. `opts.quiet` skips the emails and host ping (used when a whole series is
 * cancelled and one summary goes out instead). A group session's calendar event moves to the
 * next attendee instead of being deleted while others are still coming.
 */
export async function cancelBooking(
  workspace: Workspace,
  bookingId: string,
  by: "attendee" | "host",
  reason?: string | null,
  opts: { quiet?: boolean } = {},
) {
  const b = await db().query.bookings.findFirst({
    where: and(eq(schema.bookings.id, bookingId), eq(schema.bookings.workspaceId, workspace.id)),
  });
  if (!b || b.status === "cancelled") return b ?? null;
  const [updated] = await db()
    .update(schema.bookings)
    .set({ status: "cancelled", cancelledBy: by, cancelReason: reason?.trim() || null })
    .where(eq(schema.bookings.id, b.id))
    .returning();
  const et = b.eventTypeId
    ? await db().query.eventTypes.findFirst({ where: eq(schema.eventTypes.id, b.eventTypeId) })
    : null;
  const heir = Object.keys(b.externalEventIds).length ? await sessionSibling(b, et ?? null) : null;
  if (heir) {
    await db()
      .update(schema.bookings)
      .set({ externalEventIds: b.externalEventIds })
      .where(eq(schema.bookings.id, heir.id));
    await syncGroupGuests(heir, et ?? null);
  } else {
    await deprovisionBooking(b);
    if (et && et.seats > 1) await syncGroupGuests(b, et);
  }
  if (b.paymentStatus === "paid") await refundBooking(b);
  void notifyWaitlist(workspace, b, et ?? null).catch((e) => console.error("[waitlist]", e));
  await trackBooking(
    workspace,
    updated!,
    "cancelled",
    `${by === "host" ? "Host" : "They"} cancelled ${et?.title ?? "meeting"} on ${fmtDateTime(b.startAt, b.timezone)}${reason ? `: ${reason.trim()}` : ""}`,
    { by, reason: reason ?? null },
  );
  emitEvent(workspace.id, "booking.cancelled", {
    booking: serializeBooking(updated!, { eventType: et ?? null }),
  });
  refreshWorkspace(workspace.id);
  if (opts.quiet) return updated!;
  if (by === "attendee")
    void notifyHost(b.hostUserId, "onCancel", {
      subject: "Booking cancelled",
      text: `${b.attendeeName} cancelled their booking on ${fmtDateTime(b.startAt, workspace.timezone)}${reason ? `: ${reason}` : ""}.`,
    });
  const ctx = await mailCtx(updated!, et ?? null, workspace);
  const ics = await icsFor(ctx, "CANCEL", 2);
  const hostTo = await hostEmail(b.hostUserId);
  const a = await cancellationMail(ctx, false);
  const h = await cancellationMail(ctx, true);
  await Promise.all([
    sendEmail({
      to: b.attendeeEmail,
      subject: a.subject,
      text: a.text,
      html: a.html,
      fromName: ctx.host.displayName,
      attachments: [
        { filename: "cancel.ics", content: ics, contentType: "text/calendar; method=CANCEL" },
      ],
    }),
    hostTo
      ? sendEmail({
          to: hostTo,
          subject: h.subject,
          text: h.text,
          html: h.html,
          attachments: [
            { filename: "cancel.ics", content: ics, contentType: "text/calendar; method=CANCEL" },
          ],
        })
      : Promise.resolve(),
  ]).catch((e) => console.error("[booking] cancel email failed", e));
  return updated!;
}

/**
 * Cancels every upcoming occurrence of a series from `booking` onwards, with one summary email
 * to each side and one host ping.
 */
export async function cancelSeries(
  workspace: Workspace,
  booking: Booking,
  by: "attendee" | "host",
  reason?: string | null,
): Promise<Booking[]> {
  if (!booking.seriesId) {
    const one = await cancelBooking(workspace, booking.id, by, reason);
    return one ? [one] : [];
  }
  const targets = await db()
    .select()
    .from(schema.bookings)
    .where(
      and(
        eq(schema.bookings.seriesId, booking.seriesId),
        eq(schema.bookings.workspaceId, workspace.id),
        inArray(schema.bookings.status, ["confirmed", "pending"]),
        gt(schema.bookings.endAt, new Date()),
      ),
    )
    .orderBy(asc(schema.bookings.startAt));
  const cancelled: Booking[] = [];
  for (const t of targets) {
    const c = await cancelBooking(workspace, t.id, by, reason, { quiet: true });
    if (c) cancelled.push(c);
  }
  if (!cancelled.length) return [];
  const first = cancelled[0]!;
  const et = first.eventTypeId
    ? await db().query.eventTypes.findFirst({ where: eq(schema.eventTypes.id, first.eventTypeId) })
    : null;
  const ctx: BookingMailCtx = {
    ...(await mailCtx(first, et ?? null, workspace)),
    series: {
      index: first.seriesIndex ?? 1,
      count: first.seriesCount ?? cancelled.length,
      dates: cancelled.map((c) => c.startAt),
    },
  };
  const ics = buildIcsCalendar(
    cancelled.map((c) => icsEvent(ctx, c, "CANCEL", 2)),
    "CANCEL",
  );
  const hostTo = await hostEmail(first.hostUserId);
  const a = await cancellationMail(ctx, false);
  const h = await cancellationMail(ctx, true);
  const attachments = [
    { filename: "cancel.ics", content: ics, contentType: "text/calendar; method=CANCEL" },
  ];
  await Promise.all([
    sendEmail({
      to: first.attendeeEmail,
      subject: a.subject,
      text: a.text,
      html: a.html,
      fromName: ctx.host.displayName,
      attachments,
    }),
    hostTo
      ? sendEmail({ to: hostTo, subject: h.subject, text: h.text, html: h.html, attachments })
      : Promise.resolve(),
  ]).catch((e) => console.error("[booking] series cancel email failed", e));
  if (by === "attendee")
    void notifyHost(first.hostUserId, "onCancel", {
      subject: "Series cancelled",
      text: `${first.attendeeName} cancelled ${cancelled.length} remaining ${et?.title ?? "sessions"}${reason ? `: ${reason}` : ""}.`,
    });
  return cancelled;
}

/** Moves a booking to a new start: creates the replacement and marks the old one rescheduled. */
export async function rescheduleBooking(
  workspace: Workspace,
  bookingId: string,
  start: Date,
  timezone?: string | null,
): Promise<Booking> {
  const prev = await db().query.bookings.findFirst({
    where: and(eq(schema.bookings.id, bookingId), eq(schema.bookings.workspaceId, workspace.id)),
  });
  if (!prev || !["confirmed", "pending"].includes(prev.status))
    throw new BookingError("Only upcoming bookings can be rescheduled.");
  const et = prev.eventTypeId
    ? await db().query.eventTypes.findFirst({ where: eq(schema.eventTypes.id, prev.eventTypeId) })
    : null;
  if (!et) throw new BookingError("The event type no longer exists.");
  return createBooking(workspace, et, {
    start,
    timezone: timezone ?? prev.timezone,
    name: prev.attendeeName,
    email: prev.attendeeEmail,
    phone: prev.attendeePhone,
    notes: prev.notes,
    answers: prev.answers,
    rescheduleToken: prev.manageToken,
  });
}

export async function bookingIcs(booking: Booking, workspace: Workspace) {
  const et = booking.eventTypeId
    ? await db().query.eventTypes.findFirst({
        where: eq(schema.eventTypes.id, booking.eventTypeId),
      })
    : null;
  const ctx = {
    ...(await mailCtx(booking, et ?? null, workspace)),
    series: await seriesCtx(booking),
  };
  return icsFor(ctx, booking.status === "cancelled" ? "CANCEL" : "REQUEST");
}

/** Precise reminder / follow-up jobs for a confirmed booking (no-op on the inline driver). */
function scheduleFor(
  b: Pick<Booking, "id" | "startAt" | "endAt">,
  et: Pick<EventType, "reminders" | "followUp"> | null,
) {
  return scheduleBookingJobs({
    id: b.id,
    startAt: b.startAt,
    endAt: b.endAt,
    reminders: et?.reminders?.length ? et.reminders : [1440, 60],
    followUpDelayMin: et?.followUp?.enabled ? (et.followUp.delayMin ?? 60) : null,
  }).catch((e) => console.error("[jobs] schedule failed", e));
}
