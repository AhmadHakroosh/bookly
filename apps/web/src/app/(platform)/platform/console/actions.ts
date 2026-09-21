"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq, schema } from "@bookly/db";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { refreshWorkspace } from "@/server/cache";
import { isPlatformAdmin, tenantUrl } from "@/server/platform";
import { getSession } from "@/server/session";
import { invalidateHostCache } from "@/server/tenancy";

async function operator() {
  const session = await getSession();
  if (!session || !isPlatformAdmin(session.user.email)) throw new Error("Operators only");
  return session;
}

export async function suspendWorkspace(id: string, formData: FormData) {
  await operator();
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
  revalidatePath("/console");
}

export async function unsuspendWorkspace(id: string) {
  await operator();
  await db()
    .update(schema.workspaces)
    .set({ suspendedAt: null, suspendReason: null })
    .where(eq(schema.workspaces.id, id));
  refreshWorkspace(id);
  invalidateHostCache();
  revalidatePath("/console");
}

/** Signs the operator in as the workspace owner (Better Auth admin plugin) and opens its admin. */
export async function impersonateOwner(workspaceId: string) {
  await operator();
  const ws = await db().query.workspaces.findFirst({
    where: eq(schema.workspaces.id, workspaceId),
  });
  if (!ws) return;
  const owner = await db().query.members.findFirst({
    where: (m, { and, eq: e }) => and(e(m.organizationId, ws.organizationId), e(m.role, "owner")),
    columns: { userId: true },
  });
  if (!owner) return;
  await auth.api.impersonateUser({ headers: await headers(), body: { userId: owner.userId } });
  redirect(tenantUrl(ws.slug));
}
