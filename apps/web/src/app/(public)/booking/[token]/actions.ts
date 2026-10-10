"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq, schema } from "@bookly/db";
import { db } from "@/lib/db";
import { GUEST_ACTOR, audit } from "@/server/audit";
import { cancelBooking, cancelSeries } from "@/server/booking-flow";
import { createCheckout, paymentsReady } from "@/server/payments";
import { getBookingByToken } from "@/server/scheduling";
import { deleteTranscript } from "@/server/transcripts";
import { getCurrentWorkspace } from "@/server/workspace";

/** Lets the attendee remove the transcript of their own call. */
export async function deleteMyTranscript(token: string) {
  const ws = await getCurrentWorkspace();
  const b = await getBookingByToken(token);
  if (!ws || !b || b.workspaceId !== ws.id) return;
  await deleteTranscript(b.id);
  await audit({
    action: "transcript.deleted_by_attendee",
    target: { type: "booking", id: b.id, label: b.attendeeName },
    actor: GUEST_ACTOR(b.attendeeEmail, b.attendeeName),
    workspace: ws.id,
    changes: { transcriptStatus: { from: b.transcriptStatus, to: "deleted" } },
  });
  revalidatePath(`/booking/${token}`);
}

/** Re-opens Stripe Checkout for a booking still waiting on payment. */
export async function payNow(token: string) {
  // audit: read-only — re-opens Stripe Checkout for a booking still awaiting_payment (only the session ref is refreshed); the payment is audited as booking.paid by the webhook
  const ws = await getCurrentWorkspace();
  const b = await getBookingByToken(token);
  if (!ws || !b || b.workspaceId !== ws.id || b.status !== "awaiting_payment") return;
  if (!paymentsReady(ws)) return;
  const et = b.eventTypeId
    ? await db().query.eventTypes.findFirst({ where: eq(schema.eventTypes.id, b.eventTypeId) })
    : null;
  if (!et) return;
  redirect(await createCheckout(ws, b, et));
}

/** Cancels every upcoming session of the series this booking belongs to. */
export async function cancelRemainingByAttendee(token: string, formData: FormData) {
  const ws = await getCurrentWorkspace();
  const b = await getBookingByToken(token);
  if (!ws || !b || b.workspaceId !== ws.id) return;
  const cancelled = await cancelSeries(ws, b, "attendee", String(formData.get("reason") ?? ""));
  if (cancelled.length && (b.seriesId || b.status !== "cancelled"))
    await audit({
      action: "booking.series_cancelled",
      target: { type: "booking", id: b.id, label: b.attendeeName },
      actor: GUEST_ACTOR(b.attendeeEmail, b.attendeeName),
      workspace: ws.id,
      changes: { status: { to: "cancelled" }, sessions: { to: cancelled.length } },
    });
  revalidatePath(`/booking/${token}`);
}

export async function cancelByAttendee(token: string, formData: FormData) {
  const ws = await getCurrentWorkspace();
  const b = await getBookingByToken(token);
  if (!ws || !b || b.workspaceId !== ws.id) return;
  await cancelBooking(ws, b.id, "attendee", String(formData.get("reason") ?? ""));
  if (b.status !== "cancelled")
    await audit({
      action: "booking.cancelled",
      target: { type: "booking", id: b.id, label: b.attendeeName },
      actor: GUEST_ACTOR(b.attendeeEmail, b.attendeeName),
      workspace: ws.id,
      changes: { status: { from: b.status, to: "cancelled" } },
    });
  revalidatePath(`/booking/${token}`);
}
