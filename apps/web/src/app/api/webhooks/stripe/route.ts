import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { eq, schema } from "@bookly/db";
import { loadEnv } from "@bookly/config";
import { db } from "@/lib/db";
import { finalizeBooking } from "@/server/booking-flow";
import { recordPayment, stripe } from "@/server/payments";

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
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded"
  ) {
    const session = event.data.object;
    const bookingId = session.metadata?.bookingId;
    if (bookingId && session.payment_status === "paid") {
      const paid = await recordPayment(
        bookingId,
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : (session.payment_intent?.id ?? null),
      );
      if (paid && paid.status === "awaiting_payment") {
        const [ws, et] = await Promise.all([
          db().query.workspaces.findFirst({ where: eq(schema.workspaces.id, paid.workspaceId) }),
          paid.eventTypeId
            ? db().query.eventTypes.findFirst({ where: eq(schema.eventTypes.id, paid.eventTypeId) })
            : null,
        ]);
        if (ws && et) await finalizeBooking(ws, paid, et);
      }
    }
  }
  return NextResponse.json({ received: true });
}
