import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { loadEnv } from "@bookly/config";
import { SYSTEM_ACTOR, audit } from "@/server/audit";
import { finalizePaidBooking } from "@/server/booking-flow";
import { syncConnectAccount } from "@/server/connect";
import { stripe } from "@/server/payments";

/**
 * Stripe → Bookly, for events on hosts' connected accounts (cloud mode). `account.updated`
 * keeps the onboarding flags current so paid bookings switch on the moment Stripe enables
 * charges. Checkouts are destination charges on the platform account, so their completion
 * arrives on the platform webhook; the Checkout branch below only serves legacy direct charges.
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
      const paid = await finalizePaidBooking(
        bookingId,
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : (session.payment_intent?.id ?? null),
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
