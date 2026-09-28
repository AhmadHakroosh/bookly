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
  const quantity = plan === "team" ? billedSeats(PLANS.team, await memberCount(ws)) : 1;
  if (await changePlanInPlace(ws, price, quantity, plan, interval)) return `${back}?upgraded=1`;
  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer,
    line_items: [
      { price, quantity },
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

/**
 * Moves a live subscription to `price` instead of starting a second one: Stripe prorates the
 * remaining time and invoices the difference right away (a credit when moving down). Also
 * undoes a pending cancellation and keeps the overage price on the interval it bills on.
 * Returns false when there is nothing to change in place (no subscription, or one that ended).
 */
/** The workspace's subscription when it is live (active, trialing or past due), else null. */
export async function liveSubscription(ws: Workspace): Promise<Stripe.Subscription | null> {
  if (!ws.stripeSubscriptionId) return null;
  const sub = await stripe().subscriptions.retrieve(ws.stripeSubscriptionId);
  return ["active", "trialing", "past_due"].includes(sub.status) ? sub : null;
}

/** The item changes that move `sub` to `price`, keeping the overage on its own interval. */
async function planChangeItems(
  sub: Stripe.Subscription,
  price: string,
  quantity: number,
  interval: BillingInterval,
) {
  const item = planItem(sub);
  if (!item) return null;
  const overage = loadEnv().STRIPE_PRICE_CAPTURE_OVERAGE;
  const overageItem = overage ? sub.items.data.find((i) => i.price.id === overage) : undefined;
  const overageFits = !!overage && (await overageIntervalOf()) === interval;
  return {
    overageFits,
    items: [
      { id: item.id, price, quantity },
      ...(overageItem && !overageFits ? [{ id: overageItem.id, deleted: true as const }] : []),
      ...(!overageItem && overageFits ? [{ price: overage! }] : []),
    ],
  };
}

export type PlanChangePreview = {
  plan: PlanId;
  interval: BillingInterval;
  quantity: number;
  currency: string;
  /** What Stripe will charge right away, in cents (0 when the credit covers it). */
  dueNow: number;
  /** Credit for unused time that goes to the customer's balance, in cents (0 when none). */
  credit: number;
  /** The new price per period for all seats, in cents. */
  recurring: number;
  /**
   * When the new price starts to be billed in full: the current period's end when the interval
   * stays the same, or now when it changes (Stripe restarts the billing cycle).
   */
  from: Date | null;
  /** "Visa ···· 4242", or null when no card is on file. */
  paymentMethod: string | null;
  /** Why the change cannot be made yet (e.g. more members than the plan allows); empty = ok. */
  blockers: string[];
};

/** What stands in the way of moving the workspace to `plan`: today, only the member count. */
export async function planChangeBlockers(ws: Workspace, plan: PlanId): Promise<string[]> {
  const limit = PLANS[plan].limits.members;
  const members = await memberCount(ws);
  if (limit !== null && members > limit)
    return [
      `${PLANS[plan].name} includes ${limit === 1 ? "one member" : `${limit} members`} and this workspace has ${members}. Remove members under Team first; their booking pages and bookings stay with the workspace.`,
    ];
  return [];
}

/**
 * What an in-place plan change would cost, straight from Stripe's invoice preview, so the
 * customer can see the prorated amount and the card before agreeing. Null without a live
 * subscription (a first purchase goes through Checkout, which shows all of this itself).
 */
export async function previewPlanChange(
  ws: Workspace,
  plan: PlanId,
  interval: BillingInterval,
): Promise<PlanChangePreview | null> {
  const price = priceFor(plan, interval);
  const sub = await liveSubscription(ws);
  if (!price || !sub) return null;
  const quantity = plan === "team" ? billedSeats(PLANS.team, await memberCount(ws)) : 1;
  const change = await planChangeItems(sub, price, quantity, interval);
  if (!change) return null;
  const customer = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const [invoice, priceObj, method] = await Promise.all([
    stripe().invoices.createPreview({
      customer,
      subscription: sub.id,
      subscription_details: { items: change.items, proration_behavior: "always_invoice" },
    }),
    stripe().prices.retrieve(price),
    paymentMethodLabel(sub, customer),
  ]);
  const current = planItem(sub);
  const sameInterval = current?.price.recurring?.interval === interval;
  const periodEnd = current?.current_period_end;
  return {
    plan,
    interval,
    quantity,
    currency: invoice.currency,
    dueNow: Math.max(invoice.amount_due, 0),
    credit: invoice.total < 0 ? -invoice.total : 0,
    recurring: (priceObj.unit_amount ?? 0) * quantity,
    from: sameInterval && periodEnd ? new Date(periodEnd * 1000) : null,
    paymentMethod: method,
    blockers: await planChangeBlockers(ws, plan),
  };
}

export type SeatPreview = {
  currency: string;
  /** Charged when the invitation is accepted, prorated for the rest of the period, in cents. */
  dueOnAccept: number;
  /** The plan's price per period for all seats once the new one is billed, in cents. */
  recurring: number;
  /** Seats billed after the new member joins. */
  quantity: number;
  interval: BillingInterval;
  paymentMethod: string | null;
};

/**
 * What one more member would cost on a Team subscription, from Stripe's invoice preview, so the
 * owner can agree before inviting. Null when the invitation adds no cost: not on Team, no live
 * subscription, or the plan's minimum seats already cover the new member.
 */
export async function previewSeatAdd(ws: Workspace): Promise<SeatPreview | null> {
  if (ws.plan !== "team") return null;
  const sub = await liveSubscription(ws);
  const item = sub && planItem(sub);
  if (!sub || !item) return null;
  const quantity = billedSeats(PLANS.team, (await memberCount(ws)) + 1);
  if (quantity <= (item.quantity ?? 0)) return null;
  const customer = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const [invoice, method] = await Promise.all([
    stripe().invoices.createPreview({
      customer,
      subscription: sub.id,
      subscription_details: {
        items: [{ id: item.id, quantity }],
        proration_behavior: "always_invoice",
      },
    }),
    paymentMethodLabel(sub, customer),
  ]);
  return {
    currency: invoice.currency,
    dueOnAccept: Math.max(invoice.amount_due, 0),
    recurring: (item.price.unit_amount ?? 0) * quantity,
    quantity,
    interval: item.price.recurring?.interval === "year" ? "year" : "month",
    paymentMethod: method,
  };
}

async function paymentMethodLabel(sub: Stripe.Subscription, customer: string) {
  let id = typeof sub.default_payment_method === "string" ? sub.default_payment_method : null;
  if (!id) {
    const c = await stripe().customers.retrieve(customer);
    if (!c.deleted) {
      const d = c.invoice_settings.default_payment_method;
      id = typeof d === "string" ? d : (d?.id ?? null);
    }
  }
  if (!id) return null;
  const pm = await stripe().paymentMethods.retrieve(id);
  if (pm.card) {
    const brand = pm.card.brand.charAt(0).toUpperCase() + pm.card.brand.slice(1);
    return `${brand} ···· ${pm.card.last4}`;
  }
  return pm.type.replace(/_/g, " ");
}

async function changePlanInPlace(
  ws: Workspace,
  price: string,
  quantity: number,
  plan: PlanId,
  interval: BillingInterval,
): Promise<boolean> {
  const sub = await liveSubscription(ws);
  if (!sub) return false;
  const blockers = await planChangeBlockers(ws, plan);
  if (blockers.length) throw new Error(blockers[0]);
  const change = await planChangeItems(sub, price, quantity, interval);
  if (!change) return false;
  const { items, overageFits } = change;
  const updated = await stripe().subscriptions.update(sub.id, {
    items,
    proration_behavior: "always_invoice",
    cancel_at_period_end: false,
    metadata: { workspaceId: ws.id, plan, interval },
  });
  const customer = typeof updated.customer === "string" ? updated.customer : updated.customer.id;
  // The overage now bills on the plan subscription; a companion from a yearly period is redundant.
  if (overageFits) await cancelOverageCompanion(customer);
  await syncSubscription(updated);
  return true;
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

/**
 * Mirrors a Stripe subscription onto the workspace (webhook + checkout completion). Events for
 * a subscription the workspace no longer follows (an earlier one still winding down) are
 * ignored; `adopt` is for a subscription that just came out of Checkout and becomes the one.
 */
export async function syncSubscription(sub: Stripe.Subscription, { adopt = false } = {}) {
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
  if (!adopt && ws.stripeSubscriptionId && ws.stripeSubscriptionId !== sub.id) return;
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
    // Invoiced right away: the added seat is charged for the rest of the period now (a removed
    // one credited), instead of waiting for the next renewal, which on a yearly plan is far off.
    await stripe().subscriptionItems.update(item.id, {
      quantity: n,
      proration_behavior: "always_invoice",
    });
    return true;
  } catch (e) {
    console.error("[billing] seat sync failed", e);
    return false;
  }
}

/** Seat sync by organization id, for the auth plugin's membership hooks. */
export async function syncSeatsForOrganization(organizationId: string): Promise<void> {
  const ws = await db().query.workspaces.findFirst({
    where: eq(schema.workspaces.organizationId, organizationId),
  });
  if (ws) await syncSeats(ws);
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
