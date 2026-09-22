"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { loadEnv } from "@bookly/config";
import { schema } from "@bookly/db";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getSession } from "@/server/session";
import { needsSetup } from "@/server/workspace";
import { invalidateHostCache } from "@/server/tenancy";

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "workspace";

const schemaSetup = z.object({
  workspaceName: z.string().trim().min(2).max(80),
  // Account fields are absent when someone already signed in (e.g. after deleting a workspace).
  name: z.string().trim().min(2).max(80).optional(),
  email: z.email().optional(),
  password: z.string().min(10, "Use at least 10 characters.").max(128).optional(),
});

export type SetupState = { error?: string; fields?: Record<string, string[]> };

export async function completeSetup(_prev: SetupState, formData: FormData): Promise<SetupState> {
  if (!(await needsSetup())) redirect("/admin");

  const parsed = schemaSetup.safeParse(Object.fromEntries(formData));
  if (!parsed.success)
    return { error: "Please check the form.", fields: z.flattenError(parsed.error).fieldErrors };
  const { workspaceName, name, email, password } = parsed.data;

  // 1. Owner account: the signed-in user if there is one, otherwise a new one (sets the cookie).
  let userId: string;
  const existing = await getSession();
  if (existing) userId = existing.user.id;
  else {
    if (!name || !email || !password) return { error: "Please fill in the owner account." };
    const res = await auth.api
      .signUpEmail({ body: { name, email, password } })
      .catch((e: Error) => ({ error: e.message }));
    if ("error" in res) return { error: res.error };
    userId = res.user.id;
  }

  // 2. Organization (ownership layer) + workspace + primary host, in one transaction.
  const env = loadEnv();
  const slug = slugify(workspaceName);
  const host = new URL(env.APP_URL).host.toLowerCase();
  await db().transaction(async (tx) => {
    const orgId = crypto.randomUUID();
    await tx
      .insert(schema.organizations)
      .values({ id: orgId, name: workspaceName, slug, createdAt: new Date() });
    await tx.insert(schema.members).values({
      id: crypto.randomUUID(),
      organizationId: orgId,
      userId,
      role: "owner",
      createdAt: new Date(),
    });
    const [workspace] = await tx
      .insert(schema.workspaces)
      .values({ organizationId: orgId, slug, name: workspaceName })
      .returning({ id: schema.workspaces.id });
    await tx
      .insert(schema.workspaceDomains)
      .values({ workspaceId: workspace!.id, host, isPrimary: true, verifiedAt: new Date() });
  });
  invalidateHostCache();
  redirect("/admin");
}
