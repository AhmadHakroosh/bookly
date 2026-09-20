"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq, schema } from "@bookly/db";
import { db } from "@/lib/db";
import { cancelBooking } from "@/server/booking-flow";
import { createCheckout, paymentsConfigured } from "@/server/payments";
import { getBookingByToken } from "@/server/scheduling";
import { getCurrentWorkspace } from "@/server/workspace";

/** Re-opens Stripe Checkout for a booking still waiting on payment. */
export async function payNow(token: string) {
  const ws = await getCurrentWorkspace();
  const b = await getBookingByToken(token);
  if (!ws || !b || b.workspaceId !== ws.id || b.status !== "awaiting_payment") return;
  if (!paymentsConfigured()) return;
  const et = b.eventTypeId
    ? await db().query.eventTypes.findFirst({ where: eq(schema.eventTypes.id, b.eventTypeId) })
    : null;
  if (!et) return;
  redirect(await createCheckout(ws, b, et));
}

export async function cancelByAttendee(token: string, formData: FormData) {
  const ws = await getCurrentWorkspace();
  const b = await getBookingByToken(token);
  if (!ws || !b || b.workspaceId !== ws.id) return;
  await cancelBooking(ws, b.id, "attendee", String(formData.get("reason") ?? ""));
  revalidatePath(`/booking/${token}`);
}
