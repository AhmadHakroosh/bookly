"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isPlanId } from "@bookly/cloud";
import { eq, schema } from "@bookly/db";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { refreshWorkspace } from "@/server/cache";
import { audit } from "@/server/ops";
import { isPlatformAdmin, tenantUrl } from "@/server/platform";
import { getSession } from "@/server/session";
import { invalidateHostCache } from "@/server/tenancy";

async function operator() {
  const session = await getSession();
  if (!session || !isPlatformAdmin(session.user.email)) throw new Error("Operators only");
  return session;
}
const back = (id?: string) => {
  revalidatePath("/console");
  revalidatePath("/console/audit");
  if (id) revalidatePath(`/console/${id}`);
};

export async function suspendWorkspace(id: string, formData: FormData) {
  const s = await operator();
  const reason =
    String(formData.get("reason") ?? "")
      .trim()
      .slice(0, 300) || null;
  await db()
    .update(schema.workspaces)
    .set({ suspendedAt: new Date(), suspendReason: reason })
    .where(eq(schema.workspaces.id, id));
  refreshWorkspace(id);
  invalidateHostCache();
  await audit(s.user.email, "workspace.suspend", { type: "workspace", id }, { reason });
  back(id);
}

export async function unsuspendWorkspace(id: string) {
  const s = await operator();
  await db()
    .update(schema.workspaces)
    .set({ suspendedAt: null, suspendReason: null })
    .where(eq(schema.workspaces.id, id));
  refreshWorkspace(id);
  invalidateHostCache();
  await audit(s.user.email, "workspace.unsuspend", { type: "workspace", id });
  back(id);
}

/** Signs the operator in as the workspace owner (Better Auth admin plugin) and opens its admin. */
export async function impersonateOwner(workspaceId: string) {
  const s = await operator();
  const ws = await db().query.workspaces.findFirst({
    where: eq(schema.workspaces.id, workspaceId),
  });
  if (!ws) return;
  const owner = await db().query.members.findFirst({
    where: (m, { and, eq: e }) => and(e(m.organizationId, ws.organizationId), e(m.role, "owner")),
    columns: { userId: true },
  });
  if (!owner) return;
  await audit(
    s.user.email,
    "workspace.impersonate",
    { type: "workspace", id: workspaceId },
    { userId: owner.userId },
  );
  await auth.api.impersonateUser({ headers: await headers(), body: { userId: owner.userId } });
  redirect(tenantUrl(ws.slug));
}

/** Manual plan: comp, trial or partner deal. Stripe events leave it alone until it is released. */
export async function setPlan(id: string, formData: FormData) {
  const s = await operator();
  const plan = String(formData.get("plan") ?? "");
  const note =
    String(formData.get("note") ?? "")
      .trim()
      .slice(0, 300) || null;
  const until = String(formData.get("until") ?? "");
  const expires = until ? new Date(`${until}T23:59:59Z`) : null;
  if (!isPlanId(plan)) return;
  await db()
    .update(schema.workspaces)
    .set({
      plan,
      planStatus: "active",
      planManagedBy: "operator",
      planNote: note,
      planExpiresAt: expires && !Number.isNaN(expires.getTime()) ? expires : null,
    })
    .where(eq(schema.workspaces.id, id));
  refreshWorkspace(id);
  await audit(
    s.user.email,
    "workspace.plan.set",
    { type: "workspace", id },
    { plan, note, until: until || null },
  );
  back(id);
}

/** Hands the plan back to Stripe: whatever the subscription says (or Free without one). */
export async function releasePlan(id: string) {
  const s = await operator();
  const ws = await db().query.workspaces.findFirst({ where: eq(schema.workspaces.id, id) });
  if (!ws) return;
  await db()
    .update(schema.workspaces)
    .set({
      planManagedBy: "stripe",
      planNote: null,
      planExpiresAt: null,
      ...(ws.stripeSubscriptionId ? {} : { plan: "free", planStatus: null }),
    })
    .where(eq(schema.workspaces.id, id));
  refreshWorkspace(id);
  await audit(s.user.email, "workspace.plan.release", { type: "workspace", id });
  back(id);
}

export async function banUser(userId: string, formData: FormData) {
  const s = await operator();
  const reason =
    String(formData.get("reason") ?? "")
      .trim()
      .slice(0, 300) || "Banned by operator";
  await auth.api.banUser({ headers: await headers(), body: { userId, banReason: reason } });
  await audit(s.user.email, "user.ban", { type: "user", id: userId }, { reason });
  revalidatePath("/console/users");
  revalidatePath("/console/audit");
}

export async function unbanUser(userId: string) {
  const s = await operator();
  await auth.api.unbanUser({ headers: await headers(), body: { userId } });
  await audit(s.user.email, "user.unban", { type: "user", id: userId });
  revalidatePath("/console/users");
  revalidatePath("/console/audit");
}
