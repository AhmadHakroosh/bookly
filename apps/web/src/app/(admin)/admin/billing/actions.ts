"use server";

import { redirect } from "next/navigation";
import { isInterval, isPlanId } from "@bookly/cloud";
import {
  billingConfigured,
  billingPortal,
  liveSubscription,
  setCaptureOverage,
  startUpgrade,
  yearlyConfigured,
} from "@/server/billing";
import { revalidatePath } from "next/cache";
import { audit } from "@/server/audit";
import { requireStaff } from "@/server/session";
import { getCurrentWorkspace } from "@/server/workspace";

async function owner() {
  const [{ session, role }, ws] = await Promise.all([requireStaff(), getCurrentWorkspace()]);
  if (!ws) throw new Error("No workspace");
  if (role !== "owner" && role !== "admin") throw new Error("Only owners can change billing.");
  return { session, ws };
}

const target = (ws: { id: string; name: string }) => ({
  type: "workspace",
  id: ws.id,
  label: ws.name,
});

export async function upgrade(plan: string, interval = "month") {
  if (!isPlanId(plan) || plan === "free" || !billingConfigured()) return;
  const period = isInterval(interval) && yearlyConfigured() ? interval : "month";
  const { session, ws } = await owner();
  // With a live subscription the change is made in place, so the customer first sees what
  // Stripe will charge and agrees to it; a first purchase goes through Checkout, which does.
  if (await liveSubscription(ws)) redirect(`/admin/billing/change?plan=${plan}&interval=${period}`);
  const url = await startUpgrade(ws, plan, session.user.email, period);
  await audit({
    action: "billing.upgrade_started",
    target: target(ws),
    changes: { plan: { from: ws.plan, to: plan }, interval: { to: period } },
  });
  redirect(url);
}

/** The customer agreed to the previewed charge: apply the plan change in place. */
export async function confirmPlanChange(plan: string, interval: string) {
  if (!isPlanId(plan) || plan === "free" || !billingConfigured()) return;
  const period = isInterval(interval) && yearlyConfigured() ? interval : "month";
  const { session, ws } = await owner();
  const url = await startUpgrade(ws, plan, session.user.email, period);
  await audit({
    action: "billing.plan_changed",
    target: target(ws),
    changes: {
      plan: { from: ws.plan, to: plan },
      interval: { from: ws.settings.billingInterval, to: period },
    },
  });
  redirect(url);
}

export async function manageBilling() {
  const { ws } = await owner();
  if (!ws.stripeCustomerId) return;
  const url = await billingPortal(ws);
  await audit({ action: "billing.portal_opened", target: target(ws) });
  redirect(url);
}

/** The "keep transcribing past the included minutes" switch on the billing page. */
export async function toggleCaptureOverage(on: boolean) {
  const { ws } = await owner();
  await setCaptureOverage(ws, on);
  await audit({
    action: `billing.capture_overage_${on ? "enabled" : "disabled"}`,
    target: target(ws),
    changes: { overage: { from: ws.settings.capture?.overage ?? true, to: on } },
  });
  revalidatePath("/admin/billing");
}
