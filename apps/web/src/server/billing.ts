import "server-only";
import type Stripe from "stripe";
import {
  billedSeats,
  captureOverageDelta,
  isPlanId,
  PLANS,
  type BillingInterval,
  type PlanId,
} from "@bookly/cloud";
import type { MeetingTranscript } from "@bookly/db/schema";
import { captureBudgetFor, captureMinutesThisMonth, overageAllowed } from "./limits";
import { loadEnv } from "@bookly/config";
import { and, eq, isNotNull, schema } from "@bookly/db";
import type { Workspace } from "@bookly/db/schema";
import { db } from "@/lib/db";
import { refreshWorkspace } from "./cache";
import { getState, setState } from "./ops";
import { paymentsConfigured, stripe } from "./payments";
import { tenantUrl } from "./platform";

export const billingConfigured = () =>
  paymentsConfigured() && !!(loadEnv().STRIPE_PRICE_PRO && loadEnv().STRIPE_PRICE_TEAM);

/** Transcription past the included minutes is billed only when the metered price exists. */
export const overageConfigured = () => !!loadEnv().STRIPE_PRICE_CAPTURE_OVERAGE;

/** Marks the subscription that carries only the metered overage price next to a yearly plan. */
const OVERAGE_COMPANION = "capture-overage";

let overageInterval: Promise<Stripe.Price.Recurring.Interval | null> | undefined;
/** The billing interval of the overage price (cached per process; Stripe prices are immutable). */
function overageIntervalOf() {
  const price = loadEnv().STRIPE_PRICE_CAPTURE_OVERAGE;
  if (!price) return Promise.resolve(null);
  overageInterval ??= stripe()
    .prices.retrieve(price)
    .then((p) => p.recurring?.interval ?? null);
  return overageInterval;
}

/** True when the subscription is the overage companion, not a plan. */
const isOverageCompanion = (sub: Stripe.Subscription) =>
  sub.metadata?.kind === OVERAGE_COMPANION ||
  (!!loadEnv().STRIPE_PRICE_CAPTURE_OVERAGE &&
    sub.items.data.length > 0 &&
    sub.items.data.every((i) => i.price.id === loadEnv().STRIPE_PRICE_CAPTURE_OVERAGE));

/** The subscription item that carries the plan (not the metered overage item). */
const planItem = (sub: Stripe.Subscription) =>
  sub.items.data.find((i) => planFromPrice(i.price.id)) ?? sub.items.data[0];

/** Yearly billing is offered only when both yearly prices exist. */
export const yearlyConfigured = () =>
  !!(loadEnv().STRIPE_PRICE_PRO_YEARLY && loadEnv().STRIPE_PRICE_TEAM_YEARLY);

/** Every configured Stripe price with the plan and interval it stands for. */
function priceTable(): { id: string; plan: PlanId; interval: BillingInterval }[] {
  const e = loadEnv();
  const rows: { id: string | undefined; plan: PlanId; interval: BillingInterval }[] = [
    { id: e.STRIPE_PRICE_PRO, plan: "pro", interval: "month" },
    { id: e.STRIPE_PRICE_TEAM, plan: "team", interval: "month" },
    { id: e.STRIPE_PRICE_PRO_YEARLY, plan: "pro", interval: "year" },
    { id: e.STRIPE_PRICE_TEAM_YEARLY, plan: "team", interval: "year" },
  ];
  return rows.filter((r): r is { id: string; plan: PlanId; interval: BillingInterval } => !!r.id);
}

const priceFor = (plan: PlanId, interval: BillingInterval) =>
  priceTable().find((r) => r.plan === plan && r.interval === interval)?.id ?? null;

const planFromPrice = (priceId: string | undefined) =>
  (priceId && priceTable().find((r) => r.id === priceId)) || null;

async function customerFor(ws: Workspace, email: string) {
  if (ws.stripeCustomerId) return ws.stripeCustomerId;
  const c = await stripe().customers.create({
    email,
    name: ws.name,
    metadata: { workspaceId: ws.id, slug: ws.slug },
  });
  await db()
    .update(schema.workspaces)
    .set({ stripeCustomerId: c.id })
    .where(eq(schema.workspaces.id, ws.id));
  return c.id;
}

/** Stripe Checkout (subscription) for upgrading to `plan`. Returns the redirect URL. */
export async function startUpgrade(
  ws: Workspace,
  plan: PlanId,
  email: string,
  interval: BillingInterval = "month",
) {
  const price = priceFor(plan, interval);
  if (!price) throw new Error("This plan is not available");
  const customer = await customerFor(ws, email);
  const back = tenantUrl(ws.slug, "/admin/billing");
  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer,
    line_items: [
      { price, quantity: plan === "team" ? billedSeats(PLANS.team, await memberCount(ws)) : 1 },
      // Metered overage rides on the same subscription when it bills on the same interval
      // (Stripe allows one interval per subscription); a yearly plan gets a monthly companion
      // subscription for it the first time usage is reported (`ensureOverageItem`).
      ...(overageConfigured() && (await overageIntervalOf()) === interval
        ? [{ price: loadEnv().STRIPE_PRICE_CAPTURE_OVERAGE! }]
        : []),
    ],
    subscription_data: { metadata: { workspaceId: ws.id, plan, interval } },
    metadata: { workspaceId: ws.id, plan, interval },
    allow_promotion_codes: true,
    // Stripe Tax: sales tax / VAT on the subscription, with the customer's address and VAT id
    // collected at checkout (B2B reverse charge in the EU).
    ...(loadEnv().STRIPE_TAX === "on"
      ? {
          automatic_tax: { enabled: true },
          tax_id_collection: { enabled: true },
          customer_update: { address: "auto", name: "auto" },
        }
      : {}),
    success_url: `${back}?upgraded=1`,
    cancel_url: back,
  });
  return session.url!;
}

/** Stripe customer portal for changing card, cancelling, invoices. */
export async function billingPortal(ws: Workspace) {
  if (!ws.stripeCustomerId) throw new Error("No billing account yet");
  const s = await stripe().billingPortal.sessions.create({
    customer: ws.stripeCustomerId,
    return_url: tenantUrl(ws.slug, "/admin/billing"),
  });
  return s.url;
}

async function memberCount(ws: Workspace) {
  const rows = await db()
    .select({ id: schema.members.id })
    .from(schema.members)
    .where(eq(schema.members.organizationId, ws.organizationId));
  return rows.length;
}

/** Mirrors a Stripe subscription onto the workspace (webhook + checkout completion). */
export async function syncSubscription(sub: Stripe.Subscription) {
  const wsId = sub.metadata?.workspaceId;
  const customer = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const ws =
    (wsId && (await db().query.workspaces.findFirst({ where: eq(schema.workspaces.id, wsId) }))) ||
    (await db().query.workspaces.findFirst({
      where: eq(schema.workspaces.stripeCustomerId, customer),
    }));
  if (!ws) return;
  // The overage companion of a yearly plan carries no plan of its own.
  if (isOverageCompanion(sub)) return;
  // An operator-managed plan (comp, trial) is not touched by Stripe events.
  if (ws.planManagedBy === "operator") return;
  const item = planItem(sub);
  const known = planFromPrice(item?.price.id);
  const plan =
    known?.plan ?? (isPlanId(sub.metadata?.plan ?? "") ? (sub.metadata!.plan as PlanId) : null);
  // Stripe's own interval on the price wins; the checkout metadata is the fallback.
  const interval: BillingInterval =
    known?.interval ??
    (item?.price.recurring?.interval === "year" || sub.metadata?.interval === "year"
      ? "year"
      : "month");
  const ended = ["canceled", "incomplete_expired", "unpaid"].includes(sub.status);
  const periodEnd = item?.current_period_end;
  // "Cancel at period end" keeps the plan until then; the page shows an end date, not a renewal.
  const endsAt = !ended && sub.cancel_at ? new Date(sub.cancel_at * 1000).toISOString() : undefined;
  await db()
    .update(schema.workspaces)
    .set({
      plan: ended || !plan ? "free" : plan,
      planStatus: sub.status,
      planRenewsAt: periodEnd ? new Date(periodEnd * 1000) : null,
      stripeCustomerId: customer,
      stripeSubscriptionId: ended ? null : sub.id,
      settings: {
        ...ws.settings,
        billingInterval: ended || !plan ? undefined : interval,
        billingEndsAt: ended || !plan ? undefined : endsAt,
      },
    })
    .where(eq(schema.workspaces.id, ws.id));
  refreshWorkspace(ws.id);
  if (ended) await cancelOverageCompanion(customer);
}

/** Cancels the overage companion subscription(s) of a customer whose plan has ended. */
async function cancelOverageCompanion(customer: string) {
  const price = loadEnv().STRIPE_PRICE_CAPTURE_OVERAGE;
  if (!price) return;
  const subs = await stripe().subscriptions.list({ customer, price, status: "active", limit: 10 });
  for (const s of subs.data) {
    if (isOverageCompanion(s)) await stripe().subscriptions.cancel(s.id);
  }
}

/**
 * Keeps the Team subscription quantity in step with the member count. Called when a member
 * joins or leaves; `reconcileSeats` repeats it daily in case a call failed. Returns true when
 * Stripe was updated.
 */
export async function syncSeats(ws: Workspace): Promise<boolean> {
  if (ws.plan !== "team" || !ws.stripeSubscriptionId || !paymentsConfigured()) return false;
  try {
    const sub = await stripe().subscriptions.retrieve(ws.stripeSubscriptionId);
    const item = planItem(sub);
    const n = billedSeats(PLANS.team, await memberCount(ws));
    if (!item || item.quantity === n) return false;
    await stripe().subscriptionItems.update(item.id, {
      quantity: n,
      proration_behavior: "create_prorations",
    });
    return true;
  } catch (e) {
    console.error("[billing] seat sync failed", e);
    return false;
  }
}

const SEATS_STATE = "billing.seats";
const SEATS_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * Safety net for seat billing: once a day, every Team workspace with a subscription has its
 * quantity compared to its member count and corrected. Catches a failed sync at join or leave
 * time and any path that adds members without one. Safe to call on every tick.
 */
export async function reconcileSeats(now = new Date(), force = false) {
  if (!paymentsConfigured()) return { checked: 0, corrected: 0 };
  const last = await getState(SEATS_STATE);
  const lastAt = typeof last?.value.at === "string" ? Date.parse(last.value.at) : 0;
  if (!force && now.getTime() - lastAt < SEATS_INTERVAL_MS) return { checked: 0, corrected: 0 };
  const teams = await db()
    .select()
    .from(schema.workspaces)
    .where(
      and(eq(schema.workspaces.plan, "team"), isNotNull(schema.workspaces.stripeSubscriptionId)),
    );
  let corrected = 0;
  for (const ws of teams) if (await syncSeats(ws)) corrected++;
  await setState(SEATS_STATE, { at: now.toISOString(), checked: teams.length, corrected });
  if (corrected) console.warn(`[billing] seat reconcile corrected ${corrected} subscription(s)`);
  return { checked: teams.length, corrected };
}

export const planName = (plan: string) => (isPlanId(plan) ? PLANS[plan].name : "Self-hosted");

/**
 * Makes sure the customer has the metered overage price somewhere (idempotent): on the plan's
 * subscription when both bill on the same interval, otherwise on a companion subscription of
 * its own, since Stripe allows one interval per subscription (yearly plan, monthly overage).
 */
async function ensureOverageItem(ws: Workspace): Promise<boolean> {
  const price = loadEnv().STRIPE_PRICE_CAPTURE_OVERAGE;
  if (!price || !ws.stripeSubscriptionId) return false;
  const sub = await stripe().subscriptions.retrieve(ws.stripeSubscriptionId);
  if (sub.items.data.some((i) => i.price.id === price)) return true;
  const customer = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const planInterval = planItem(sub)?.price.recurring?.interval;
  if (!planInterval || planInterval === (await overageIntervalOf())) {
    await stripe().subscriptionItems.create({ subscription: sub.id, price });
    return true;
  }
  const existing = await stripe().subscriptions.list({
    customer,
    price,
    status: "active",
    limit: 1,
  });
  if (existing.data.length > 0) return true;
  await stripe().subscriptions.create({
    customer,
    items: [{ price }],
    metadata: { workspaceId: ws.id, kind: OVERAGE_COMPANION },
  });
  return true;
}

/**
 * Bills the part of a finished transcript that fell past the month's included minutes: a meter
 * event on the workspace's Stripe customer, keyed by the transcript so a retry cannot double
 * count. Returns the minutes reported (0 when nothing was over or overage is off).
 */
export async function reportCaptureOverage(
  ws: Workspace,
  transcript: Pick<MeetingTranscript, "id" | "startedAt" | "endedAt">,
): Promise<number> {
  if (!overageAllowed(ws) || !ws.stripeCustomerId || !transcript.endedAt || !transcript.startedAt)
    return 0;
  const max = await captureBudgetFor(ws);
  if (max === null || max === 0) return 0;
  const minutes = Math.ceil(
    (transcript.endedAt.getTime() - transcript.startedAt.getTime()) / 60_000,
  );
  // The month's total already includes this transcript (its end time is set).
  const after = await captureMinutesThisMonth(ws);
  const over = captureOverageDelta(after - minutes, after, max);
  if (over <= 0) return 0;
  try {
    await ensureOverageItem(ws);
    await stripe().billing.meterEvents.create({
      event_name: loadEnv().STRIPE_METER_CAPTURE_EVENT,
      identifier: `capture:${transcript.id}`,
      payload: { stripe_customer_id: ws.stripeCustomerId, value: String(over) },
    });
    console.log(`[billing] capture overage: ${over} min for ${ws.slug} (${transcript.id})`);
    return over;
  } catch (e) {
    console.error("[billing] capture overage report failed", e);
    return 0;
  }
}

/** Host preference: keep transcribing past the included minutes (billed) or stop there. */
export async function setCaptureOverage(ws: Workspace, on: boolean) {
  await db()
    .update(schema.workspaces)
    .set({ settings: { ...ws.settings, capture: { ...(ws.settings.capture ?? {}), overage: on } } })
    .where(eq(schema.workspaces.id, ws.id));
  refreshWorkspace(ws.id);
}
