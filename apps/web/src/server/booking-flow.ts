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
import { buildIcs } from "./ics";
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

/** Validates the slot, stores the booking, and emails both sides. Meeting links come from K2 providers. */
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
  const status: Booking["status"] = eventType.requiresConfirmation ? "pending" : "confirmed";

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
    })
    .returning();

  await notifyCreated(workspace, booking!, eventType);
  refreshWorkspace(workspace.id);
  return booking!;
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
  const [updated] = await db()
    .update(schema.bookings)
    .set({ status: "confirmed" })
    .where(eq(schema.bookings.id, b.id))
    .returning();
  const et = b.eventTypeId
    ? await db().query.eventTypes.findFirst({ where: eq(schema.eventTypes.id, b.eventTypeId) })
    : null;
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
  const et = b.eventTypeId
    ? await db().query.eventTypes.findFirst({ where: eq(schema.eventTypes.id, b.eventTypeId) })
    : null;
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

export async function bookingIcs(booking: Booking, workspace: Workspace) {
  const et = booking.eventTypeId
    ? await db().query.eventTypes.findFirst({
        where: eq(schema.eventTypes.id, booking.eventTypeId),
      })
    : null;
  const ctx = await mailCtx(booking, et ?? null, workspace);
  return icsFor(ctx, booking.status === "cancelled" ? "CANCEL" : "REQUEST");
}
