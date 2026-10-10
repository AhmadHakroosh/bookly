"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  connectDashboardUrl,
  connectOnboardingUrl,
  disconnectStripe,
  refreshConnectStatus,
} from "@/server/connect";
import { eq, schema } from "@bookly/db";
import { db } from "@/lib/db";
import { audit, diff } from "@/server/audit";
import { refreshWorkspace } from "@/server/cache";
import { hasFeature } from "@/server/limits";
import { paymentsConfigured } from "@/server/payments";
import { isCloud } from "@/server/platform";
import { requireStaff } from "@/server/session";
import { getCurrentWorkspace } from "@/server/workspace";

async function owner() {
  const [{ session, role }, ws] = await Promise.all([requireStaff(), getCurrentWorkspace()]);
  if (!ws || !isCloud() || !paymentsConfigured()) throw new Error("Payments are not available");
  if (role !== "owner" && role !== "admin") throw new Error("Only owners can connect Stripe.");
  return { session, ws };
}

const target = (ws: { id: string; name: string }) => ({
  type: "workspace",
  id: ws.id,
  label: ws.name,
});

/** Sends the owner to Stripe's hosted onboarding; creates the account on the first visit. */
export async function connectStripeAction() {
  const { session, ws } = await owner();
  if (!hasFeature(ws, "payments")) redirect("/admin/billing");
  const url = await connectOnboardingUrl(ws, session.user.email);
  await audit({ action: "payments.stripe_connect_started", target: target(ws) });
  redirect(url);
}

/** Stripe invoices in the host's name with every paid booking (Pro and up). */
export async function setInvoicesAction(on: boolean) {
  const { ws } = await owner();
  if (!hasFeature(ws, "invoices")) redirect("/admin/billing");
  await db()
    .update(schema.workspaces)
    .set({
      settings: { ...ws.settings, payments: { ...(ws.settings.payments ?? {}), invoices: on } },
    })
    .where(eq(schema.workspaces.id, ws.id));
  refreshWorkspace(ws.id);
  await audit({
    action: `payments.invoices_${on ? "enabled" : "disabled"}`,
    target: target(ws),
    changes: { invoices: { from: ws.settings.payments?.invoices ?? false, to: on } },
  });
  revalidatePath("/admin/settings/payments");
}

export async function refreshStripeAction() {
  const { ws } = await owner();
  const status = await refreshConnectStatus(ws);
  await audit({
    action: "payments.stripe_refreshed",
    target: target(ws),
    changes: diff(ws.settings.payments ?? {}, status ?? {}, [
      "chargesEnabled",
      "payoutsEnabled",
      "detailsSubmitted",
    ]),
  });
  revalidatePath("/admin/settings/payments");
}

export async function openStripeDashboardAction() {
  const { ws } = await owner();
  const url = await connectDashboardUrl(ws);
  if (!url) return;
  await audit({ action: "payments.stripe_dashboard_opened", target: target(ws) });
  redirect(url);
}

export async function disconnectStripeAction() {
  const { ws } = await owner();
  await disconnectStripe(ws);
  await audit({ action: "payments.stripe_disconnected", target: target(ws) });
  revalidatePath("/admin/settings/payments");
}
