import "server-only";
import { createHmac, randomBytes } from "node:crypto";
import { after } from "next/server";
import { and, eq, lte, or, schema, sql } from "@bookly/db";
import type { WebhookEvent } from "@bookly/db/schema";
import { db } from "@/lib/db";
import { enqueue } from "./jobs";

export const generateWebhookSecret = () => `whsec_${randomBytes(24).toString("base64url")}`;

export function sign(secret: string, timestamp: number, body: string) {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

/** Verifies a `X-Bookly-Signature: t=<unix>,v1=<hex>` header (for consumers and tests). */
export function verifySignature(secret: string, header: string, body: string, toleranceSec = 300) {
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
  const t = Number(parts.t);
  if (!t || Math.abs(Date.now() / 1000 - t) > toleranceSec) return false;
  return sign(secret, t, body) === parts.v1;
}

/**
 * Queues an event for every active webhook subscribed to it and attempts delivery after the
 * response is sent. Failed deliveries are retried by the cron tick / worker.
 */
export function emitEvent(
  workspaceId: string,
  event: WebhookEvent,
  payload: Record<string, unknown>,
) {
  const run = async () => {
    try {
      const hooks = await db()
        .select()
        .from(schema.webhooks)
        .where(
          and(
            eq(schema.webhooks.workspaceId, workspaceId),
            eq(schema.webhooks.active, 1),
            sql`${schema.webhooks.events} ? ${event}`,
          ),
        );
      for (const hook of hooks) {
        const [d] = await db()
          .insert(schema.webhookDeliveries)
          .values({ webhookId: hook.id, event, payload })
          .returning();
        await enqueue("webhook.deliver", { deliveryId: d!.id });
      }
    } catch (e) {
      console.error("[webhooks] emit failed", e);
    }
  };
  try {
    after(run);
  } catch {
    void run(); // no request scope (worker/cron): deliver directly
  }
}

const BACKOFF_MIN = [1, 5, 30, 120, 720]; // minutes

export async function attemptDelivery(deliveryId: string) {
  const d = await db().query.webhookDeliveries.findFirst({
    where: eq(schema.webhookDeliveries.id, deliveryId),
  });
  if (!d || d.status === "delivered" || d.status === "failed") return;
  // A retry that arrives before its backoff (tick and queue overlap) waits for the later one.
  if (d.nextAttemptAt && d.nextAttemptAt.getTime() - Date.now() > 5_000) return;
  const hook = await db().query.webhooks.findFirst({ where: eq(schema.webhooks.id, d.webhookId) });
  if (!hook) return;
  const body = JSON.stringify({
    id: d.id,
    event: d.event,
    createdAt: d.createdAt.toISOString(),
    data: d.payload,
  });
  const ts = Math.floor(Date.now() / 1000);
  let status = 0;
  let text = "";
  try {
    const res = await fetch(hook.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Bookly-Webhooks/1",
        "X-Bookly-Event": d.event,
        "X-Bookly-Delivery": d.id,
        "X-Bookly-Signature": `t=${ts},v1=${sign(hook.secret, ts, body)}`,
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    status = res.status;
    text = (await res.text().catch(() => "")).slice(0, 1000);
  } catch (e) {
    text = (e as Error).message.slice(0, 1000);
  }
  const ok = status >= 200 && status < 300;
  const attempts = d.attempts + 1;
  const next =
    !ok && attempts <= BACKOFF_MIN.length
      ? new Date(Date.now() + BACKOFF_MIN[attempts - 1]! * 60_000)
      : null;
  await db()
    .update(schema.webhookDeliveries)
    .set({
      status: ok ? "delivered" : next ? "pending" : "failed",
      attempts,
      responseStatus: status || null,
      responseBody: text || null,
      nextAttemptAt: next,
      deliveredAt: ok ? new Date() : null,
    })
    .where(eq(schema.webhookDeliveries.id, d.id));
  // Retry at the backoff time through the queue; the 5-minute tick remains the safety net.
  if (!ok && next)
    await enqueue(
      "webhook.deliver",
      { deliveryId },
      {
        delaySeconds: Math.ceil((next.getTime() - Date.now()) / 1000),
        dedupeId: `wh:${deliveryId}:${attempts}`,
      },
    ).catch(() => undefined);
  await db()
    .update(schema.webhooks)
    .set({
      lastStatus: status || null,
      lastDeliveredAt: ok ? new Date() : hook.lastDeliveredAt,
      failures: ok ? 0 : sql`${schema.webhooks.failures} + 1`,
    })
    .where(eq(schema.webhooks.id, hook.id));
}

/** Retries due deliveries; called by the cron tick and the worker. */
export async function retryDueDeliveries(limit = 50) {
  const due = await db()
    .select({ id: schema.webhookDeliveries.id })
    .from(schema.webhookDeliveries)
    .where(
      and(
        eq(schema.webhookDeliveries.status, "pending"),
        or(
          lte(schema.webhookDeliveries.nextAttemptAt, sql`now()`),
          sql`${schema.webhookDeliveries.nextAttemptAt} is null and ${schema.webhookDeliveries.attempts} > 0`,
        ),
      ),
    )
    .limit(limit);
  for (const d of due) await attemptDelivery(d.id);
  return due.length;
}
