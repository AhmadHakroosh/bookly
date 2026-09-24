"use server";

import { revalidatePath } from "next/cache";
import { and, eq, schema } from "@bookly/db";
import { db } from "@/lib/db";
import { normalizeHost, verifyDomain } from "@/server/domains";
import { invalidatePrimaryDomainCache } from "@/server/urls";
import { assertWithinLimit, LimitError } from "@/server/limits";
import { requireStaff } from "@/server/session";
import { getCurrentWorkspace } from "@/server/workspace";
import { invalidateHostCache } from "@/server/tenancy";

async function ctx() {
  const [, workspace] = await Promise.all([requireStaff(), getCurrentWorkspace()]);
  if (!workspace) throw new Error("No workspace");
  return workspace;
}

export type DomainState = { error?: string; ok?: boolean };

export async function addDomain(_prev: DomainState, formData: FormData): Promise<DomainState> {
  const workspace = await ctx();
  const host = normalizeHost(String(formData.get("host") ?? ""));
  if (!host) return { error: "Enter a valid hostname, e.g. blog.example.com" };
  try {
    await assertWithinLimit(workspace, "domains");
  } catch (e) {
    if (e instanceof LimitError) return { error: `${e.message} See Billing.` };
    throw e;
  }
  const taken = await db().query.workspaceDomains.findFirst({
    where: eq(schema.workspaceDomains.host, host),
    columns: { workspaceId: true },
  });
  if (taken)
    return {
      error:
        taken.workspaceId === workspace.id
          ? "Already added."
          : "This domain is used by another workspace.",
    };
  await db()
    .insert(schema.workspaceDomains)
    .values({
      workspaceId: workspace.id,
      host,
      isPrimary: false,
      verificationToken: `bookly-verify=${crypto.randomUUID().replace(/-/g, "")}`,
    });
  revalidatePath("/admin/domains");
  return { ok: true };
}

export async function checkDomain(id: string) {
  const workspace = await ctx();
  await verifyDomain(workspace.id, id);
  invalidateHostCache();
  invalidatePrimaryDomainCache();
  revalidatePath("/admin/domains");
}

export async function makePrimary(id: string) {
  const workspace = await ctx();
  await db().transaction(async (tx) => {
    await tx
      .update(schema.workspaceDomains)
      .set({ isPrimary: false })
      .where(eq(schema.workspaceDomains.workspaceId, workspace.id));
    await tx
      .update(schema.workspaceDomains)
      .set({ isPrimary: true })
      .where(
        and(
          eq(schema.workspaceDomains.id, id),
          eq(schema.workspaceDomains.workspaceId, workspace.id),
        ),
      );
  });
  invalidateHostCache();
  invalidatePrimaryDomainCache();
  revalidatePath("/admin/domains");
}

export async function removeDomain(id: string) {
  const workspace = await ctx();
  const row = await db().query.workspaceDomains.findFirst({
    where: and(
      eq(schema.workspaceDomains.id, id),
      eq(schema.workspaceDomains.workspaceId, workspace.id),
    ),
  });
  if (!row || row.isPrimary) return;
  await db().delete(schema.workspaceDomains).where(eq(schema.workspaceDomains.id, id));
  invalidateHostCache();
  invalidatePrimaryDomainCache();
  revalidatePath("/admin/domains");
}
