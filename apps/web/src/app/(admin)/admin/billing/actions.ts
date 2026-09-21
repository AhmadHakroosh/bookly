"use server";

import { redirect } from "next/navigation";
import { isPlanId } from "@bookly/cloud";
import { billingConfigured, billingPortal, startUpgrade } from "@/server/billing";
import { requireStaff } from "@/server/session";
import { getCurrentWorkspace } from "@/server/workspace";

async function owner() {
  const [{ session, role }, ws] = await Promise.all([requireStaff(), getCurrentWorkspace()]);
  if (!ws) throw new Error("No workspace");
  if (role !== "owner" && role !== "admin") throw new Error("Only owners can change billing.");
  return { session, ws };
}

export async function upgrade(plan: string) {
  if (!isPlanId(plan) || plan === "free" || !billingConfigured()) return;
  const { session, ws } = await owner();
  redirect(await startUpgrade(ws, plan, session.user.email));
}

export async function manageBilling() {
  const { ws } = await owner();
  if (!ws.stripeCustomerId) return;
  redirect(await billingPortal(ws));
}
