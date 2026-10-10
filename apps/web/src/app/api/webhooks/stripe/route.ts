import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { loadEnv } from "@bookly/config";
import { SYSTEM_ACTOR, audit } from "@/server/audit";
import { finalizePaidBooking } from "@/server/booking-flow";
import { syncSubscription } from "@/server/billing";
import { stripe } from "@/server/payments";

/** Stripe → Bookly: a paid Checkout session confirms its booking. */
export async function POST(req: Request) {
  const secret = loadEnv().STRIPE_WEBHOOK_SECRET;
  if (!secret)
    return NextResponse.json({ error: "STRIPE_WEBHOOK_SECRET not set" }, { status: 500 });
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
  if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    await syncSubscription(event.data.object);
    return NextResponse.json({ received: true });
  }
  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded"
  ) {
    const session = event.data.object;
    if (session.mode === "subscription" && session.subscription) {
      const sub = await stripe().subscriptions.retrieve(String(session.subscription));
      await syncSubscription(sub, { adopt: true });
      return NextResponse.json({ received: true });
    }
    const bookingId = session.metadata?.bookingId;
    if (bookingId && session.payment_status === "paid") {
      const paid = await finalizePaidBooking(
        bookingId,
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : (session.payment_intent?.id ?? null),
        typeof session.invoice === "string" ? session.invoice : (session.invoice?.id ?? null),
      );
      if (paid)
        await audit({
          action: "booking.paid",
          target: { type: "booking", id: paid.id, label: paid.attendeeName },
          actor: SYSTEM_ACTOR("stripe"),
          workspace: paid.workspaceId,
          changes: {
            paymentStatus: { to: paid.paymentStatus },
            status: { from: "awaiting_payment", to: paid.status },
          },
        });
    }
  }
  return NextResponse.json({ received: true });
}
