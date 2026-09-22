import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { loadEnv } from "@bookly/config";
import { finalizePaidBooking } from "@/server/booking-flow";
import { syncConnectAccount } from "@/server/connect";
import { stripe } from "@/server/payments";

/**
 * Stripe → Bookly, for events on hosts' connected accounts (cloud mode). A paid Checkout on a
 * host's account confirms its booking; `account.updated` keeps the onboarding flags current so
 * paid bookings switch on the moment Stripe enables charges.
 */
export async function POST(req: Request) {
  const secret = loadEnv().STRIPE_CONNECT_WEBHOOK_SECRET;
  if (!secret)
    return NextResponse.json({ error: "STRIPE_CONNECT_WEBHOOK_SECRET not set" }, { status: 500 });
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(
      await req.text(),
      req.headers.get("stripe-signature") ?? "",
      secret,
    );
  } catch (e) {
    return NextResponse.json(
      { error: `Invalid signature: ${(e as Error).message}` },
      { status: 400 },
    );
  }
  // Every event here carries the connected account it happened on; ignore anything that does not.
  if (!event.account) return NextResponse.json({ received: true, ignored: "no account" });
  if (event.type === "account.updated") {
    await syncConnectAccount(event.data.object);
    return NextResponse.json({ received: true });
  }
  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded"
  ) {
    const session = event.data.object;
    const bookingId = session.metadata?.bookingId;
    if (bookingId && session.payment_status === "paid") {
      await finalizePaidBooking(
        bookingId,
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : (session.payment_intent?.id ?? null),
      );
    }
  }
  return NextResponse.json({ received: true });
}
