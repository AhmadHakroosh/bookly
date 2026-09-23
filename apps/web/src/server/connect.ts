import "server-only";
import { effectivePlan } from "@bookly/cloud";
import type Stripe from "stripe";
import { desc, eq, isNotNull, schema } from "@bookly/db";
import type { Workspace } from "@bookly/db/schema";
import { db } from "@/lib/db";
import { refreshWorkspace } from "./cache";
import { tenantUrl } from "./platform";
import { invalidateHostCache } from "./tenancy";

/**
 * Stripe Connect for cloud mode. A host's guests pay the host, not the platform: each
 * workspace connects its own Stripe account (Express onboarding, hosted by Stripe), booking
 * checkouts run on that account, and the platform keeps a fee per payment. Bookly stores only
 * the account id and the flags Stripe reports; it never sees the host's keys or balance.
 */

const STATE_KEY = "payments";
/** The rate outside a cloud plan (self-hosted with Connect); cloud plans carry their own. */
export const DEFAULT_FEE_PERCENT = 5;

export type ConnectStatus = NonNullable<Workspace["settings"]["payments"]>;

/** The console-wide override, or null when plans use their own rates. */
export async function platformFeeOverride(): Promise<number | null> {
  const s = await db().query.platformState.findFirst({
    where: eq(schema.platformState.key, STATE_KEY),
  });
  const v = s?.value.feePercent;
  return typeof v === "number" ? clampFee(v) : null;
}

/**
 * Platform fee, as a percentage of each booking payment: the workspace's own override, else the
 * console-wide override, else the rate of the workspace's plan (Free 5%, Pro 3%, Team 1%; a
 * lapsed plan pays Free's), else the default outside cloud plans.
 */
export async function platformFeePercent(
  ws?: Pick<Workspace, "settings" | "plan" | "planStatus">,
): Promise<number> {
  const override = ws?.settings.payments?.feePercent;
  if (typeof override === "number") return clampFee(override);
  const global = await platformFeeOverride();
  if (global !== null) return global;
  const plan = ws ? effectivePlan(ws.plan, ws.planStatus) : null;
  return plan ? plan.feePercent : DEFAULT_FEE_PERCENT;
}

/** Sets the console-wide override; null returns every workspace to its plan's rate. */
export async function setPlatformFeePercent(percent: number | null) {
  if (percent === null) {
    await db().delete(schema.platformState).where(eq(schema.platformState.key, STATE_KEY));
    return;
  }
  const value = { feePercent: clampFee(percent) };
  await db()
    .insert(schema.platformState)
    .values({ key: STATE_KEY, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: schema.platformState.key,
      set: { value, updatedAt: new Date() },
    });
}

export const clampFee = (p: number) => Math.min(50, Math.max(0, Math.round(p * 100) / 100));

/** Fee in minor units for an amount; never more than the amount itself. */
export function platformFeeCents(amountCents: number, percent: number): number {
  if (amountCents <= 0 || percent <= 0) return 0;
  return Math.min(amountCents, Math.round((amountCents * percent) / 100));
}

async function stripeClient() {
  const { stripe } = await import("./payments");
  return stripe();
}

/**
 * Starts (or resumes) Stripe onboarding for the workspace and returns the URL to send the owner
 * to. The Express account is created on the first call and remembered.
 */
export async function connectOnboardingUrl(ws: Workspace, email: string): Promise<string> {
  const stripe = await stripeClient();
  let account = ws.stripeAccountId;
  if (!account) {
    const a = await stripe.accounts.create({
      type: "express",
      email,
      business_profile: { name: ws.name },
      capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
      metadata: { workspaceId: ws.id, slug: ws.slug },
    });
    account = a.id;
    await db()
      .update(schema.workspaces)
      .set({
        stripeAccountId: account,
        settings: {
          ...ws.settings,
          payments: { ...(ws.settings.payments ?? {}), connectedAt: new Date().toISOString() },
        },
      })
      .where(eq(schema.workspaces.id, ws.id));
    refreshWorkspace(ws.id);
    invalidateHostCache();
  }
  const link = await stripe.accountLinks.create({
    account,
    type: "account_onboarding",
    refresh_url: tenantUrl(ws.slug, "/admin/settings?stripe=refresh"),
    return_url: tenantUrl(ws.slug, "/admin/settings?stripe=return"),
  });
  return link.url;
}

/** Pulls the account's current flags from Stripe (after onboarding, or from the console). */
export async function refreshConnectStatus(ws: Workspace): Promise<ConnectStatus | null> {
  if (!ws.stripeAccountId) return null;
  const stripe = await stripeClient();
  const a = await stripe.accounts.retrieve(ws.stripeAccountId);
  return syncConnectAccount(a);
}

/** Applies an `account.updated` event (or a fresh retrieve) to the workspace that owns it. */
export async function syncConnectAccount(a: Stripe.Account): Promise<ConnectStatus | null> {
  const ws = await db().query.workspaces.findFirst({
    where: eq(schema.workspaces.stripeAccountId, a.id),
  });
  if (!ws) return null;
  const payments: ConnectStatus = {
    ...(ws.settings.payments ?? {}),
    chargesEnabled: !!a.charges_enabled,
    payoutsEnabled: !!a.payouts_enabled,
    detailsSubmitted: !!a.details_submitted,
  };
  await db()
    .update(schema.workspaces)
    .set({ settings: { ...ws.settings, payments } })
    .where(eq(schema.workspaces.id, ws.id));
  refreshWorkspace(ws.id);
  invalidateHostCache();
  return payments;
}

/** One-time link into the host's Express dashboard (balance, payouts, disputes). */
export async function connectDashboardUrl(ws: Workspace): Promise<string | null> {
  if (!ws.stripeAccountId) return null;
  const stripe = await stripeClient();
  const l = await stripe.accounts.createLoginLink(ws.stripeAccountId);
  return l.url;
}

/**
 * Forgets the connected account: new bookings stop charging until another account is
 * connected. Past payments stay on the host's Stripe account; refunds of them still work
 * because each booking remembers which account it was charged on.
 */
export async function disconnectStripe(ws: Workspace) {
  const fee = ws.settings.payments?.feePercent;
  await db()
    .update(schema.workspaces)
    .set({
      stripeAccountId: null,
      settings: {
        ...ws.settings,
        payments: typeof fee === "number" ? { feePercent: fee } : null,
      },
    })
    .where(eq(schema.workspaces.id, ws.id));
  refreshWorkspace(ws.id);
  invalidateHostCache();
}

/** Operator override of the platform fee for one workspace (null = platform default). */
export async function setWorkspaceFeePercent(ws: Workspace, percent: number | null) {
  await db()
    .update(schema.workspaces)
    .set({
      settings: {
        ...ws.settings,
        payments: {
          ...(ws.settings.payments ?? {}),
          feePercent: percent === null ? null : clampFee(percent),
        },
      },
    })
    .where(eq(schema.workspaces.id, ws.id));
  refreshWorkspace(ws.id);
  invalidateHostCache();
}

/** Every workspace with a Stripe account, newest first, for the console. */
export async function listConnectedWorkspaces() {
  return db()
    .select()
    .from(schema.workspaces)
    .where(isNotNull(schema.workspaces.stripeAccountId))
    .orderBy(desc(schema.workspaces.updatedAt));
}
