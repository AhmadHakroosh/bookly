"use server";

import { revalidatePath } from "next/cache";
import { and, eq, schema } from "@bookly/db";
import { db } from "@/lib/db";
import { audit } from "@/server/audit";
import { normalizeHost, verifyDomain } from "@/server/domains";
import { invalidatePrimaryDomainCache } from "@/server/urls";
import { assertWithinLimit, LimitError } from "@/server/limits";
import { assertManager } from "@/server/session";
import { getCurrentWorkspace } from "@/server/workspace";
import { invalidateHostCache } from "@/server/tenancy";

/** Domains serve the whole workspace: owner/admin only. */
async function ctx() {
  const [{ error }, workspace] = await Promise.all([assertManager(), getCurrentWorkspace()]);
  if (error) throw new Error(error);
  if (!workspace) throw new Error("No workspace");
  return workspace;
}

export type DomainState = { error?: string; ok?: boolean };

export async function addDomain(_prev: DomainState, formData: FormData): Promise<DomainState> {
  const workspace = await ctx();
  const host = normalizeHost(String(formData.get("host") ?? ""));
  if (!host) return { error: "Enter a valid hostname, e.g. book.example.com" };
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
  const [row] = await db()
    .insert(schema.workspaceDomains)
    .values({
      workspaceId: workspace.id,
      host,
      isPrimary: false,
      verificationToken: `bookly-verify=${crypto.randomUUID().replace(/-/g, "")}`,
    })
    .returning({ id: schema.workspaceDomains.id });
  await audit({ action: "domain.added", target: { type: "domain", id: row?.id, label: host } });
  revalidatePath("/admin/domains");
  return { ok: true };
}

export async function checkDomain(id: string) {
  const workspace = await ctx();
  const row = await db().query.workspaceDomains.findFirst({
    where: and(
      eq(schema.workspaceDomains.id, id),
      eq(schema.workspaceDomains.workspaceId, workspace.id),
    ),
    columns: { host: true, verifiedAt: true },
  });
  if (!row) return;
  const r = await verifyDomain(workspace.id, id);
  await audit({
    action: "domain.checked",
    target: { type: "domain", id, label: row.host },
    changes: {
      verified: { from: !!row.verifiedAt, to: r.ok },
      ...(r.ok ? {} : { error: { to: r.error ?? (!r.txt ? "txt" : "not pointing here") } }),
    },
  });
  invalidateHostCache();
  invalidatePrimaryDomainCache();
  revalidatePath("/admin/domains");
}

export async function makePrimary(id: string) {
  const workspace = await ctx();
  const [row] = await db().transaction(async (tx) => {
    await tx
      .update(schema.workspaceDomains)
      .set({ isPrimary: false })
      .where(eq(schema.workspaceDomains.workspaceId, workspace.id));
    return tx
      .update(schema.workspaceDomains)
      .set({ isPrimary: true })
      .where(
        and(
          eq(schema.workspaceDomains.id, id),
          eq(schema.workspaceDomains.workspaceId, workspace.id),
        ),
      )
      .returning({ host: schema.workspaceDomains.host });
  });
  if (row)
    await audit({ action: "domain.made_primary", target: { type: "domain", id, label: row.host } });
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
  await audit({ action: "domain.removed", target: { type: "domain", id, label: row.host } });
  invalidateHostCache();
  invalidatePrimaryDomainCache();
  revalidatePath("/admin/domains");
}
