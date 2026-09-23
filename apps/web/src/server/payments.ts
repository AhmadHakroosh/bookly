import "server-only";
import Stripe from "stripe";
import { and, asc, eq, inArray, lte, schema } from "@bookly/db";
import { loadEnv } from "@bookly/config";
import type { Booking, EventType, Workspace } from "@bookly/db/schema";
import { db } from "@/lib/db";
import { platformFeeCents, platformFeePercent } from "./connect";
import { hasFeature } from "./limits";
import { isCloud } from "./platform";
import { baseUrl } from "./scheduling";

let client: Stripe | undefined;
export function stripe(): Stripe {
  const key = loadEnv().STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  return (client ??= new Stripe(key));
}
/** The platform's own Stripe key is present (plan subscriptions; self-hosted bookings). */
export const paymentsConfigured = () => !!loadEnv().STRIPE_SECRET_KEY;

/**
 * Where a workspace's booking payments go. Self-hosted: straight to the install's own Stripe
 * account (the operator is the host). Cloud: to the host's connected Stripe account, never the
 * platform's, so the plan must include payments and the host must have finished Stripe's
 * onboarding. Until then prices are ignored and bookings stay free.
 */
export type PaymentRoute =
  | { ok: true; account: string | null }
  | { ok: false; reason: "unconfigured" | "plan" | "not_connected" | "pending" };

export function paymentsFor(ws: Workspace): PaymentRoute {
  if (!paymentsConfigured()) return { ok: false, reason: "unconfigured" };
  if (!isCloud()) return { ok: true, account: null };
  if (!hasFeature(ws, "payments")) return { ok: false, reason: "plan" };
  if (!ws.stripeAccountId) return { ok: false, reason: "not_connected" };
  if (!ws.settings.payments?.chargesEnabled) return { ok: false, reason: "pending" };
  return { ok: true, account: ws.stripeAccountId };
}

export const paymentsReady = (ws: Workspace) => paymentsFor(ws).ok;

/** Why paid bookings are off for this workspace, for the event type form and error messages. */
export function paymentsHint(ws: Workspace): string {
  const r = paymentsFor(ws);
  if (r.ok) return "";
  switch (r.reason) {
    case "unconfigured":
      return isCloud()
        ? "Payments are not enabled on this platform yet."
        : "Stripe is not set up on this server, so bookings stay free (docs/payments.md).";
    case "plan":
      return "Paid bookings are not included in your plan (Billing).";
    case "not_connected":
      return "Connect your Stripe account under Settings → Payments to charge for bookings.";
    case "pending":
      return "Finish Stripe's onboarding under Settings → Payments before charging for bookings.";
  }
}

/** Per-request options that put a call on the host's connected account. */
const onAccount = (account: string | null) => (account ? { stripeAccount: account } : undefined);

/** Unpaid bookings are released after this long so the slot frees up. */
export const PAYMENT_WINDOW_MIN = 30;

export const isPaid = (et: Pick<EventType, "priceCents">) => (et.priceCents ?? 0) > 0;

export function formatPrice(cents: number, currency: string | null | undefined, locale = "en-US") {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: (currency ?? "USD").toUpperCase(),
  }).format(cents / 100);
}

/** Every unpaid occurrence a Checkout for `booking` should cover (the whole series, or just it). */
async function unpaidMembers(booking: Booking): Promise<Booking[]> {
  if (!booking.seriesId) return [booking];
  const rows = await db()
    .select()
    .from(schema.bookings)
    .where(
      and(
        eq(schema.bookings.seriesId, booking.seriesId),
        eq(schema.bookings.status, "awaiting_payment"),
      ),
    )
    .orderBy(asc(schema.bookings.seriesIndex));
  return rows.length ? rows : [booking];
}

/**
 * Starts a Stripe Checkout session for an unpaid booking and returns the URL to redirect to.
 * A recurring series is paid in one go: one line item with the number of sessions as quantity.
 */
export async function createCheckout(
  workspace: Workspace,
  booking: Booking,
  eventType: EventType,
): Promise<string> {
  const route = paymentsFor(workspace);
  if (!route.ok) throw new Error(paymentsHint(workspace));
  const manage = `${baseUrl()}/booking/${booking.manageToken}`;
  const members = await unpaidMembers(booking);
  const total = eventType.priceCents! * members.length;
  const fee = route.account ? platformFeeCents(total, await platformFeePercent(workspace)) : 0;
  const session = await stripe().checkout.sessions.create(
    {
      mode: "payment",
      customer_email: booking.attendeeEmail,
      line_items: [
        {
          quantity: members.length,
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
      metadata: {
        bookingId: members[0]!.id,
        workspaceId: workspace.id,
        ...(booking.seriesId ? { seriesId: booking.seriesId } : {}),
      },
      payment_intent_data: {
        metadata: { bookingId: members[0]!.id, workspaceId: workspace.id },
        ...(fee > 0 ? { application_fee_amount: fee } : {}),
      },
      success_url: `${manage}?paid=1`,
      cancel_url: manage,
      expires_at: Math.floor(Date.now() / 1000) + PAYMENT_WINDOW_MIN * 60,
    },
    onAccount(route.account),
  );
  await db()
    .update(schema.bookings)
    .set({
      paymentStatus: "pending",
      amountCents: eventType.priceCents,
      currency: eventType.currency ?? "usd",
      paymentRef: {
        ...(booking.paymentRef ?? {}),
        sessionId: session.id,
        ...(route.account ? { stripeAccount: route.account, feeCents: fee } : {}),
      },
    })
    .where(
      inArray(
        schema.bookings.id,
        members.map((m) => m.id),
      ),
    );
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

/**
 * Refunds a paid booking (best-effort; logged on failure). A series was charged in one payment,
 * so only this occurrence's share is refunded.
 */
export async function refundBooking(b: Booking) {
  if (b.paymentStatus !== "paid" || !b.paymentRef?.paymentIntentId || !paymentsConfigured())
    return false;
  try {
    // A charge on the host's account is refunded there; the platform fee goes back with it.
    const r = await stripe().refunds.create(
      {
        payment_intent: b.paymentRef.paymentIntentId,
        ...(b.seriesId && b.amountCents ? { amount: b.amountCents } : {}),
        ...(b.paymentRef.stripeAccount ? { refund_application_fee: true } : {}),
      },
      onAccount(b.paymentRef.stripeAccount ?? null),
    );
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
