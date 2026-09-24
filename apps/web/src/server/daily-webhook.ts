import "server-only";
import { loadEnv } from "@bookly/config";
import { eq, schema } from "@bookly/db";
import { db } from "@/lib/db";
import { dailyConfigured, registerDailyWebhook } from "./integrations/daily";

/**
 * Bookly video needs one Daily webhook for the whole install: Daily is a platform account, not a
 * per-workspace one, and the webhook route finds the workspace from the room. The registration
 * lives in `platform_state` (key `daily.webhook`) and is made, or remade when APP_URL changed,
 * the first time a room is created and on every job tick. Capture and join pings both depend on
 * it, so it must never hinge on a notification preference.
 */
const STATE_KEY = "daily.webhook";
export type DailyWebhook = { id: string; hmac: string; url: string };

export const dailyWebhookUrl = () => `${loadEnv().APP_URL.replace(/\/$/, "")}/api/webhooks/daily`;

export async function currentDailyWebhook(): Promise<DailyWebhook | null> {
  const row = await db().query.platformState.findFirst({
    where: eq(schema.platformState.key, STATE_KEY),
  });
  const v = row?.value as Partial<DailyWebhook> | undefined;
  return v?.id && v.hmac && v.url ? { id: v.id, hmac: v.hmac, url: v.url } : null;
}

let checked: { at: number; hook: DailyWebhook | null } | null = null;

/** Registers the webhook when missing or pointing elsewhere; cheap to call often. */
export async function ensureDailyWebhook(): Promise<DailyWebhook | null> {
  if (!dailyConfigured()) return null;
  const url = dailyWebhookUrl();
  if (checked && checked.hook?.url === url && Date.now() - checked.at < 10 * 60_000)
    return checked.hook;
  const current = await currentDailyWebhook();
  if (current?.url === url) {
    checked = { at: Date.now(), hook: current };
    return current;
  }
  // Daily needs the URL to answer its {"test":"test"} probe; local http servers cannot.
  if (!url.startsWith("https://")) return null;
  const hook = await registerDailyWebhook(url, current?.id);
  await db()
    .insert(schema.platformState)
    .values({ key: STATE_KEY, value: hook, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: schema.platformState.key,
      set: { value: hook, updatedAt: new Date() },
    });
  console.log(`[daily] webhook registered at ${url}`);
  checked = { at: Date.now(), hook };
  return hook;
}
