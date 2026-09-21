import "server-only";
import type Stripe from "stripe";
import { isPlanId, PLANS, type PlanId } from "@bookly/cloud";
import { loadEnv } from "@bookly/config";
import { eq, schema } from "@bookly/db";
import type { Workspace } from "@bookly/db/schema";
import { db } from "@/lib/db";
import { refreshWorkspace } from "./cache";
import { paymentsConfigured, stripe } from "./payments";
import { tenantUrl } from "./platform";

export const billingConfigured = () =>
  paymentsConfigured() && !!(loadEnv().STRIPE_PRICE_PRO && loadEnv().STRIPE_PRICE_TEAM);

const priceFor = (plan: PlanId) =>
  plan === "pro"
    ? loadEnv().STRIPE_PRICE_PRO
    : plan === "team"
      ? loadEnv().STRIPE_PRICE_TEAM
      : null;

const planFromPrice = (priceId: string | undefined): PlanId | null =>
  !priceId
    ? null
    : priceId === loadEnv().STRIPE_PRICE_PRO
      ? "pro"
      : priceId === loadEnv().STRIPE_PRICE_TEAM
        ? "team"
        : null;

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
export async function startUpgrade(ws: Workspace, plan: PlanId, email: string) {
  const price = priceFor(plan);
  if (!price) throw new Error("This plan is not available");
  const customer = await customerFor(ws, email);
  const back = tenantUrl(ws.slug, "/admin/billing");
  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer,
    line_items: [{ price, quantity: plan === "team" ? Math.max(1, await memberCount(ws)) : 1 }],
    subscription_data: { metadata: { workspaceId: ws.id, plan } },
    metadata: { workspaceId: ws.id, plan },
    allow_promotion_codes: true,
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
  const priceId = sub.items.data[0]?.price.id;
  const plan =
    planFromPrice(priceId) ??
    (isPlanId(sub.metadata?.plan ?? "") ? (sub.metadata!.plan as PlanId) : null);
  const ended = ["canceled", "incomplete_expired", "unpaid"].includes(sub.status);
  const periodEnd = sub.items.data[0]?.current_period_end;
  await db()
    .update(schema.workspaces)
    .set({
      plan: ended || !plan ? "free" : plan,
      planStatus: sub.status,
      planRenewsAt: periodEnd ? new Date(periodEnd * 1000) : null,
      stripeCustomerId: customer,
      stripeSubscriptionId: ended ? null : sub.id,
    })
    .where(eq(schema.workspaces.id, ws.id));
  refreshWorkspace(ws.id);
}

/** Keeps the Team subscription quantity in step with the member count. */
export async function syncSeats(ws: Workspace) {
  if (ws.plan !== "team" || !ws.stripeSubscriptionId || !paymentsConfigured()) return;
  try {
    const sub = await stripe().subscriptions.retrieve(ws.stripeSubscriptionId);
    const item = sub.items.data[0];
    const n = Math.max(1, await memberCount(ws));
    if (item && item.quantity !== n)
      await stripe().subscriptionItems.update(item.id, {
        quantity: n,
        proration_behavior: "create_prorations",
      });
  } catch (e) {
    console.error("[billing] seat sync failed", e);
  }
}

export const planName = (plan: string) => (isPlanId(plan) ? PLANS[plan].name : "Self-hosted");
