"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { loadEnv } from "@bookly/config";
import { eq, schema } from "@bookly/db";
import { db } from "@/lib/db";
import { isCloud, tenantUrl } from "@/server/platform";
import { getSession } from "@/server/session";
import { invalidateHostCache } from "@/server/tenancy";

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

const RESERVED = new Set([
  "www",
  "app",
  "api",
  "admin",
  "mail",
  "meet",
  "book",
  "console",
  "help",
  "docs",
  "status",
]);

export type CreateState = { error?: string };

/** Creates the org + workspace + subdomain for the signed-in user and sends them to its admin. */
export async function createWorkspace(
  _prev: CreateState,
  formData: FormData,
): Promise<CreateState> {
  if (!isCloud()) return { error: "Not available" };
  const session = await getSession();
  if (!session) return { error: "Please sign in first." };
  const parsed = z
    .object({ name: z.string().trim().min(2).max(60), slug: z.string().trim().max(40).default("") })
    .safeParse({ name: formData.get("name"), slug: formData.get("slug") });
  if (!parsed.success) return { error: "Give your workspace a name (2–60 characters)." };
  const name = parsed.data.name;
  const slug = slugify(parsed.data.slug || name);
  if (slug.length < 3) return { error: "The address needs at least 3 characters." };
  if (RESERVED.has(slug)) return { error: "That address is reserved. Pick another." };
  const taken = await db().query.workspaces.findFirst({
    where: eq(schema.workspaces.slug, slug),
    columns: { id: true },
  });
  if (taken) return { error: "That address is taken. Pick another." };

  const env = loadEnv();
  const host = `${slug}.${env.ROOT_DOMAIN}`.toLowerCase();
  await db().transaction(async (tx) => {
    const orgId = crypto.randomUUID();
    await tx
      .insert(schema.organizations)
      .values({ id: orgId, name, slug: `${slug}-${orgId.slice(0, 6)}`, createdAt: new Date() });
    await tx.insert(schema.members).values({
      id: crypto.randomUUID(),
      organizationId: orgId,
      userId: session.user.id,
      role: "owner",
      createdAt: new Date(),
    });
    const [ws] = await tx
      .insert(schema.workspaces)
      .values({ organizationId: orgId, slug, name, plan: "free", timezone: "UTC" })
      .returning({ id: schema.workspaces.id });
    await tx
      .insert(schema.workspaceDomains)
      .values({ workspaceId: ws!.id, host, isPrimary: true, verifiedAt: new Date() });
  });
  invalidateHostCache();
  redirect(tenantUrl(slug, "/admin/profile?setup=1"));
}
