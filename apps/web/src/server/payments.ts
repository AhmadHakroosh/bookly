import "server-only";
import Stripe from "stripe";
import { and, eq, lte, schema } from "@bookly/db";
import { loadEnv } from "@bookly/config";
import type { Booking, EventType, Workspace } from "@bookly/db/schema";
import { db } from "@/lib/db";
import { baseUrl } from "./scheduling";

let client: Stripe | undefined;
export function stripe(): Stripe {
  const key = loadEnv().STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  return (client ??= new Stripe(key));
}
export const paymentsConfigured = () => !!loadEnv().STRIPE_SECRET_KEY;

/** Unpaid bookings are released after this long so the slot frees up. */
export const PAYMENT_WINDOW_MIN = 30;

export const isPaid = (et: Pick<EventType, "priceCents">) => (et.priceCents ?? 0) > 0;

export function formatPrice(cents: number, currency: string | null | undefined, locale = "en-US") {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: (currency ?? "USD").toUpperCase(),
  }).format(cents / 100);
}

/** Starts a Stripe Checkout session for an unpaid booking and returns the URL to redirect to. */
export async function createCheckout(
  workspace: Workspace,
  booking: Booking,
  eventType: EventType,
): Promise<string> {
  const manage = `${baseUrl()}/booking/${booking.manageToken}`;
  const session = await stripe().checkout.sessions.create({
    mode: "payment",
    customer_email: booking.attendeeEmail,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: (eventType.currency ?? "usd").toLowerCase(),
          unit_amount: eventType.priceCents!,
          product_data: {
            name: `${eventType.title} (${eventType.durationMin} min)`,
            description: `with ${workspace.name}`,
          },
        },
      },
    ],
    metadata: { bookingId: booking.id, workspaceId: workspace.id },
    payment_intent_data: { metadata: { bookingId: booking.id } },
    success_url: `${manage}?paid=1`,
    cancel_url: manage,
    expires_at: Math.floor(Date.now() / 1000) + PAYMENT_WINDOW_MIN * 60,
  });
  await db()
    .update(schema.bookings)
    .set({
      paymentStatus: "pending",
      amountCents: eventType.priceCents,
      currency: eventType.currency ?? "usd",
      paymentRef: { ...(booking.paymentRef ?? {}), sessionId: session.id },
    })
    .where(eq(schema.bookings.id, booking.id));
  return session.url!;
}

/** Records a successful payment; returns the booking (or null if unknown/already paid). */
export async function recordPayment(bookingId: string, paymentIntentId: string | null) {
  const b = await db().query.bookings.findFirst({ where: eq(schema.bookings.id, bookingId) });
  if (!b || b.paymentStatus === "paid") return null;
  const [updated] = await db()
    .update(schema.bookings)
    .set({
      paymentStatus: "paid",
      paymentRef: { ...(b.paymentRef ?? {}), paymentIntentId: paymentIntentId ?? undefined },
    })
    .where(eq(schema.bookings.id, b.id))
    .returning();
  return updated ?? null;
}

/** Refunds a paid booking (best-effort; logged on failure). */
export async function refundBooking(b: Booking) {
  if (b.paymentStatus !== "paid" || !b.paymentRef?.paymentIntentId || !paymentsConfigured())
    return false;
  try {
    const r = await stripe().refunds.create({ payment_intent: b.paymentRef.paymentIntentId });
    await db()
      .update(schema.bookings)
      .set({ paymentStatus: "refunded", paymentRef: { ...b.paymentRef, refundId: r.id } })
      .where(eq(schema.bookings.id, b.id));
    return true;
  } catch (e) {
    console.error("[payments] refund failed", e);
    return false;
  }
}

/** Releases bookings whose payment window passed. Called from the cron tick / worker. */
export async function expireUnpaidBookings(now = new Date()) {
  const cutoff = new Date(now.getTime() - PAYMENT_WINDOW_MIN * 60_000);
  const rows = await db()
    .update(schema.bookings)
    .set({ status: "cancelled", cancelledBy: "system", cancelReason: "Payment not completed" })
    .where(
      and(eq(schema.bookings.status, "awaiting_payment"), lte(schema.bookings.createdAt, cutoff)),
    )
    .returning({ id: schema.bookings.id });
  return rows.length;
}
