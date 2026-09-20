"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq, schema } from "@bookly/db";
import { API_SCOPES, WEBHOOK_EVENTS, type ApiScope, type WebhookEvent } from "@bookly/db/schema";
import { db } from "@/lib/db";
import { generateApiKey } from "@/server/api";
import { requireStaff } from "@/server/session";
import { getCurrentWorkspace } from "@/server/workspace";
import { attemptDelivery, generateWebhookSecret } from "@/server/webhooks";

async function ctx() {
  const [, workspace] = await Promise.all([requireStaff(), getCurrentWorkspace()]);
  if (!workspace) throw new Error("No workspace");
  return workspace;
}

export type KeyState = { created?: { name: string; raw: string }; error?: string };

export async function createApiKey(_prev: KeyState, formData: FormData): Promise<KeyState> {
  const workspace = await ctx();
  const name = String(formData.get("name") ?? "")
    .trim()
    .slice(0, 80);
  const scopes = formData
    .getAll("scopes")
    .map(String)
    .filter((s): s is ApiScope => (API_SCOPES as readonly string[]).includes(s));
  if (!name) return { error: "Give the key a name." };
  const { raw, prefix, hash } = generateApiKey();
  await db()
    .insert(schema.apiKeys)
    .values({ workspaceId: workspace.id, name, prefix, keyHash: hash, scopes });
  revalidatePath("/admin/api");
  return { created: { name, raw } };
}

export async function revokeApiKey(id: string) {
  const workspace = await ctx();
  await db()
    .update(schema.apiKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(schema.apiKeys.id, id), eq(schema.apiKeys.workspaceId, workspace.id)));
  revalidatePath("/admin/api");
}

export type HookState = { created?: { url: string; secret: string }; error?: string };

export async function createWebhook(_prev: HookState, formData: FormData): Promise<HookState> {
  const workspace = await ctx();
  const url = z.url().safeParse(String(formData.get("url") ?? "").trim());
  if (!url.success || !/^https?:/.test(url.data)) return { error: "Enter a valid http(s) URL." };
  const events = formData
    .getAll("events")
    .map(String)
    .filter((e): e is WebhookEvent => (WEBHOOK_EVENTS as readonly string[]).includes(e));
  if (!events.length) return { error: "Pick at least one event." };
  const secret = generateWebhookSecret();
  await db()
    .insert(schema.webhooks)
    .values({
      workspaceId: workspace.id,
      url: url.data,
      secret,
      events,
      description:
        String(formData.get("description") ?? "")
          .trim()
          .slice(0, 120) || null,
    });
  revalidatePath("/admin/api");
  return { created: { url: url.data, secret } };
}

export async function toggleWebhook(id: string, active: boolean) {
  const workspace = await ctx();
  await db()
    .update(schema.webhooks)
    .set({ active: active ? 1 : 0 })
    .where(and(eq(schema.webhooks.id, id), eq(schema.webhooks.workspaceId, workspace.id)));
  revalidatePath("/admin/api");
}

export async function deleteWebhook(id: string) {
  const workspace = await ctx();
  await db()
    .delete(schema.webhooks)
    .where(and(eq(schema.webhooks.id, id), eq(schema.webhooks.workspaceId, workspace.id)));
  revalidatePath("/admin/api");
}

export async function retryDelivery(id: string) {
  const workspace = await ctx();
  const d = await db()
    .select({ id: schema.webhookDeliveries.id })
    .from(schema.webhookDeliveries)
    .innerJoin(schema.webhooks, eq(schema.webhooks.id, schema.webhookDeliveries.webhookId))
    .where(and(eq(schema.webhookDeliveries.id, id), eq(schema.webhooks.workspaceId, workspace.id)));
  if (d[0]) await attemptDelivery(d[0].id);
  revalidatePath("/admin/api");
}

/** Sends a signed `ping` delivery so the receiver can be verified. */
export async function pingWebhook(id: string) {
  const workspace = await ctx();
  const hook = await db().query.webhooks.findFirst({
    where: and(eq(schema.webhooks.id, id), eq(schema.webhooks.workspaceId, workspace.id)),
  });
  if (!hook) return;
  const [d] = await db()
    .insert(schema.webhookDeliveries)
    .values({
      webhookId: hook.id,
      event: "ping",
      payload: { workspace: workspace.slug, at: new Date().toISOString() },
    })
    .returning();
  await attemptDelivery(d!.id);
  revalidatePath("/admin/api");
}
