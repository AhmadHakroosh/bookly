import "server-only";
import { and, eq, schema } from "@bookly/db";
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
import { buildIcs } from "./ics";
import { deprovisionBooking, provisionBooking } from "./integrations";
import { serializeBooking } from "./api";
import { notifyHost } from "./notify";
import { isPaid, paymentsConfigured, refundBooking } from "./payments";
import { emitEvent } from "./webhooks";
import { refreshWorkspace } from "./cache";
import { baseUrl, getProfileByUser, locationLabel, newToken, slotIsBookable } from "./scheduling";

export type BookingInput = {
  start: Date;
  timezone: string;
  name: string;
  email: string;
  phone?: string | null;
  notes?: string | null;
  answers: Record<string, string>;
  rescheduleToken?: string | null;
};

export class BookingError extends Error {}

async function mailCtx(
  booking: Booking,
  eventType: EventType | null,
  workspace: Workspace,
): Promise<BookingMailCtx> {
  const host = (await getProfileByUser(workspace.id, booking.hostUserId))!;
  return { booking, eventType, host, workspaceName: workspace.name, baseUrl: baseUrl() };
}

function icsFor(ctx: BookingMailCtx, method: "REQUEST" | "CANCEL", sequence = 0) {
  const b = ctx.booking;
  return buildIcs({
    uid: `${b.id}@bookly`,
    start: b.startAt,
    end: b.endAt,
    summary: `${ctx.eventType?.title ?? "Meeting"}: ${ctx.host.displayName} and ${b.attendeeName}`,
    description: `${b.meetingUrl ?? locationLabel(b.location)}\n\nManage: ${ctx.baseUrl}/booking/${b.manageToken}`,
    location: b.meetingUrl ?? locationLabel(b.location),
    url: `${ctx.baseUrl}/booking/${b.manageToken}`,
    organizer: {
      name: ctx.host.displayName,
      email: (ctx.host as Profile & { email?: string }).email ?? "noreply@bookly",
    },
    attendees: [{ name: b.attendeeName, email: b.attendeeEmail }],
    method,
    sequence,
    status: method === "CANCEL" ? "CANCELLED" : "CONFIRMED",
  });
}

async function hostEmail(userId: string) {
  const u = await db().query.users.findFirst({
    where: eq(schema.users.id, userId),
    columns: { email: true },
  });
  return u?.email ?? null;
}

/** Creates the meeting link + calendar events and stores them on the booking (best-effort). */
async function provision(workspace: Workspace, booking: Booking, eventType: EventType | null) {
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

/** Validates the slot, stores the booking, provisions meeting/calendar, and emails both sides. */
export async function createBooking(
  workspace: Workspace,
  eventType: EventType,
  input: BookingInput,
): Promise<Booking> {
  if (!(await slotIsBookable(eventType, input.timezone, input.start)))
    throw new BookingError("That time is no longer available. Please pick another slot.");
  for (const q of eventType.questions) {
    if (q.required && !input.answers[q.id]?.trim())
      throw new BookingError(`Please answer: ${q.label}`);
  }
  const end = new Date(input.start.getTime() + eventType.durationMin * 60_000);
  const needsPayment = isPaid(eventType) && paymentsConfigured();
  const status: Booking["status"] = needsPayment
    ? "awaiting_payment"
    : eventType.requiresConfirmation
      ? "pending"
      : "confirmed";

  let rescheduledFromId: string | null = null;
  if (input.rescheduleToken) {
    const prev = await db().query.bookings.findFirst({
      where: eq(schema.bookings.manageToken, input.rescheduleToken),
    });
    if (prev && prev.status !== "cancelled") {
      rescheduledFromId = prev.id;
      await db()
        .update(schema.bookings)
        .set({ status: "rescheduled" })
        .where(eq(schema.bookings.id, prev.id));
      await deprovisionBooking(prev);
    }
  }

  const [booking] = await db()
    .insert(schema.bookings)
    .values({
      workspaceId: workspace.id,
      eventTypeId: eventType.id,
      hostUserId: eventType.userId,
      startAt: input.start,
      endAt: end,
      timezone: input.timezone,
      attendeeName: input.name.trim().slice(0, 120),
      attendeeEmail: input.email.trim().toLowerCase(),
      attendeePhone: input.phone?.trim() || null,
      notes: input.notes?.trim() || null,
      answers: input.answers,
      status,
      manageToken: newToken(),
      rescheduledFromId,
      location: eventType.location,
      amountCents: needsPayment ? eventType.priceCents : null,
      currency: needsPayment ? (eventType.currency ?? "usd") : null,
    })
    .returning();

  // Paid bookings are finalised by the Stripe webhook (see finalizeBooking).
  if (needsPayment) return booking!;
  return finalizeBooking(workspace, booking!, eventType, rescheduledFromId);
}

/**
 * Second half of booking creation: provisions meeting + calendar, sends emails, pings the
 * host, emits webhooks. Runs immediately for free bookings and after payment for paid ones.
 */
export async function finalizeBooking(
  workspace: Workspace,
  booking: Booking,
  eventType: EventType,
  rescheduledFromId: string | null = booking.rescheduledFromId,
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
  await notifyCreated(workspace, booking, eventType);
  const when = fmtDateTime(
    booking.startAt,
    (await getProfileByUser(workspace.id, booking.hostUserId))?.timezone ?? workspace.timezone,
  );
  void notifyHost(booking.hostUserId, "onBooking", {
    subject: `New booking: ${eventType.title}`,
    text: `${booking.attendeeName} booked ${eventType.title} on ${when}${booking.status === "pending" ? " (needs your confirmation)" : ""}. ${baseUrl()}/admin/bookings`,
  });
  const payload = { booking: serializeBooking(booking, { eventType }) };
  emitEvent(workspace.id, "booking.created", payload);
  if (rescheduledFromId)
    emitEvent(workspace.id, "booking.rescheduled", {
      ...payload,
      previousBookingId: rescheduledFromId,
    });
  refreshWorkspace(workspace.id);
  return booking;
}

async function notifyCreated(workspace: Workspace, booking: Booking, eventType: EventType | null) {
  const ctx = await mailCtx(booking, eventType, workspace);
  const ics = icsFor(ctx, "REQUEST");
  const a = attendeeConfirmation(ctx);
  const h = hostNotification(ctx);
  const hostTo = await hostEmail(booking.hostUserId);
  await Promise.all([
    sendEmail({
      to: booking.attendeeEmail,
      subject: a.subject,
      text: a.text,
      html: a.html,
      replyTo: hostTo ?? undefined,
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
  emitEvent(workspace.id, "booking.confirmed", {
    booking: serializeBooking(updated!, { eventType: et ?? null }),
  });
  const ctx = await mailCtx(updated!, et ?? null, workspace);
  const a = attendeeConfirmation(ctx);
  await sendEmail({
    to: b.attendeeEmail,
    subject: a.subject,
    text: a.text,
    html: a.html,
    attachments: [
      {
        filename: "invite.ics",
        content: icsFor(ctx, "REQUEST", 1),
        contentType: "text/calendar; method=REQUEST",
      },
    ],
  }).catch(() => {});
  refreshWorkspace(workspace.id);
  return updated!;
}

export async function cancelBooking(
  workspace: Workspace,
  bookingId: string,
  by: "attendee" | "host",
  reason?: string | null,
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
  await deprovisionBooking(b);
  if (b.paymentStatus === "paid") await refundBooking(b);
  if (by === "attendee")
    void notifyHost(b.hostUserId, "onCancel", {
      subject: "Booking cancelled",
      text: `${b.attendeeName} cancelled their booking on ${fmtDateTime(b.startAt, workspace.timezone)}${reason ? `: ${reason}` : ""}.`,
    });
  const et = b.eventTypeId
    ? await db().query.eventTypes.findFirst({ where: eq(schema.eventTypes.id, b.eventTypeId) })
    : null;
  emitEvent(workspace.id, "booking.cancelled", {
    booking: serializeBooking(updated!, { eventType: et ?? null }),
  });
  const ctx = await mailCtx(updated!, et ?? null, workspace);
  const ics = icsFor(ctx, "CANCEL", 2);
  const hostTo = await hostEmail(b.hostUserId);
  const a = cancellationMail(ctx, false);
  const h = cancellationMail(ctx, true);
  await Promise.all([
    sendEmail({
      to: b.attendeeEmail,
      subject: a.subject,
      text: a.text,
      html: a.html,
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
  refreshWorkspace(workspace.id);
  return updated!;
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
  const ctx = await mailCtx(booking, et ?? null, workspace);
  return icsFor(ctx, booking.status === "cancelled" ? "CANCEL" : "REQUEST");
}
