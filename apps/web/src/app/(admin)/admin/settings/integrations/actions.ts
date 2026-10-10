"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq, schema } from "@bookly/db";
import { API_SCOPES, WEBHOOK_EVENTS, type ApiScope, type WebhookEvent } from "@bookly/db/schema";
import { db } from "@/lib/db";
import { generateApiKey } from "@/server/api";
import { audit } from "@/server/audit";
import { assertManager } from "@/server/session";
import { getCurrentWorkspace } from "@/server/workspace";
import { attemptDelivery, generateWebhookSecret } from "@/server/webhooks";

/** Keys and webhooks act for the whole workspace: owner/admin only. */
async function ctx() {
  const [{ error }, workspace] = await Promise.all([assertManager(), getCurrentWorkspace()]);
  if (error) throw new Error(error);
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
  const [key] = await db()
    .insert(schema.apiKeys)
    .values({ workspaceId: workspace.id, name, prefix, keyHash: hash, scopes })
    .returning({ id: schema.apiKeys.id });
  await audit({
    action: "api_key.created",
    target: { type: "api_key", id: key?.id, label: `${name} (${prefix}…)` },
    changes: { scopes: { to: scopes } },
  });
  revalidatePath("/admin/settings/integrations");
  return { created: { name, raw } };
}

export async function revokeApiKey(id: string) {
  const workspace = await ctx();
  const [key] = await db()
    .update(schema.apiKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(schema.apiKeys.id, id), eq(schema.apiKeys.workspaceId, workspace.id)))
    .returning({ id: schema.apiKeys.id, name: schema.apiKeys.name, prefix: schema.apiKeys.prefix });
  if (key)
    await audit({
      action: "api_key.revoked",
      target: { type: "api_key", id: key.id, label: `${key.name} (${key.prefix}…)` },
    });
  revalidatePath("/admin/settings/integrations");
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
  const [hook] = await db()
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
    })
    .returning({ id: schema.webhooks.id });
  await audit({
    action: "webhook.created",
    target: { type: "webhook", id: hook?.id, label: url.data },
    changes: { events: { to: events } },
  });
  revalidatePath("/admin/settings/integrations");
  return { created: { url: url.data, secret } };
}

export async function toggleWebhook(id: string, active: boolean) {
  const workspace = await ctx();
  const [hook] = await db()
    .update(schema.webhooks)
    .set({ active: active ? 1 : 0 })
    .where(and(eq(schema.webhooks.id, id), eq(schema.webhooks.workspaceId, workspace.id)))
    .returning({ id: schema.webhooks.id, url: schema.webhooks.url });
  if (hook)
    await audit({
      action: `webhook.${active ? "enabled" : "disabled"}`,
      target: { type: "webhook", id: hook.id, label: hook.url },
    });
  revalidatePath("/admin/settings/integrations");
}

export async function deleteWebhook(id: string) {
  const workspace = await ctx();
  const [hook] = await db()
    .delete(schema.webhooks)
    .where(and(eq(schema.webhooks.id, id), eq(schema.webhooks.workspaceId, workspace.id)))
    .returning({ id: schema.webhooks.id, url: schema.webhooks.url });
  if (hook)
    await audit({
      action: "webhook.deleted",
      target: { type: "webhook", id: hook.id, label: hook.url },
    });
  revalidatePath("/admin/settings/integrations");
}

export async function retryDelivery(id: string) {
  const workspace = await ctx();
  const d = await db()
    .select({
      id: schema.webhookDeliveries.id,
      event: schema.webhookDeliveries.event,
      webhookId: schema.webhooks.id,
      url: schema.webhooks.url,
    })
    .from(schema.webhookDeliveries)
    .innerJoin(schema.webhooks, eq(schema.webhooks.id, schema.webhookDeliveries.webhookId))
    .where(and(eq(schema.webhookDeliveries.id, id), eq(schema.webhooks.workspaceId, workspace.id)));
  if (d[0]) {
    await attemptDelivery(d[0].id);
    await audit({
      action: "webhook.retried",
      target: { type: "webhook", id: d[0].webhookId, label: d[0].url },
      changes: { delivery: { to: d[0].id }, event: { to: d[0].event } },
    });
  }
  revalidatePath("/admin/settings/integrations");
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
  await audit({
    action: "webhook.pinged",
    target: { type: "webhook", id: hook.id, label: hook.url },
    changes: { delivery: { to: d!.id } },
  });
  revalidatePath("/admin/settings/integrations");
}
