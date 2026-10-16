import "server-only";
import webpush from "web-push";
import { and, eq, inArray, schema } from "@bookly/db";
import { loadEnv } from "@bookly/config";
import { db } from "@/lib/db";

/*
 * Web Push: the browser hands us an endpoint plus keys when a member turns on desktop
 * notifications; we sign each message with the install's VAPID key pair and the browser's push
 * service wakes the service worker (`public/sw.js`), even with every Bookly tab closed.
 */

let configured: boolean | null = null;

/** The public key browsers subscribe with, or null when Web Push is not set up. */
export function vapidPublicKey(): string | null {
  const env = loadEnv();
  return env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY ? env.VAPID_PUBLIC_KEY : null;
}

function ready() {
  if (configured !== null) return configured;
  const env = loadEnv();
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return (configured = false);
  webpush.setVapidDetails(
    env.VAPID_SUBJECT || `mailto:${env.SUPPORT_EMAIL ?? "noreply@bookly-app.io"}`,
    env.VAPID_PUBLIC_KEY,
    env.VAPID_PRIVATE_KEY,
  );
  return (configured = true);
}

export type PushPayload = {
  /** The notification row id; the service worker uses it as the tag so a retry replaces, not repeats. */
  id: string;
  title: string;
  body?: string | null;
  /** Absolute URL opened on click. */
  url: string;
};

/**
 * Sends one payload to every browser a member subscribed in this workspace. Endpoints the push
 * service says are gone (404/410) are deleted; other failures are logged, never thrown.
 */
export async function pushToUser(workspaceId: string, userId: string, payload: PushPayload) {
  if (!ready()) return 0;
  const subs = await db()
    .select()
    .from(schema.pushSubscriptions)
    .where(
      and(
        eq(schema.pushSubscriptions.workspaceId, workspaceId),
        eq(schema.pushSubscriptions.userId, userId),
      ),
    );
  if (!subs.length) return 0;
  const gone: string[] = [];
  const sent: string[] = [];
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload),
          { TTL: 60 * 60 * 24, urgency: "high", topic: payload.id.replace(/-/g, "").slice(0, 32) },
        );
        sent.push(s.id);
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) gone.push(s.id);
        else console.error("[push] send failed", status ?? e);
      }
    }),
  );
  if (gone.length)
    await db().delete(schema.pushSubscriptions).where(inArray(schema.pushSubscriptions.id, gone));
  if (sent.length)
    await db()
      .update(schema.pushSubscriptions)
      .set({ lastSentAt: new Date() })
      .where(inArray(schema.pushSubscriptions.id, sent));
  return sent.length;
}

/** "Chrome on macOS" from a user agent, for the device list. */
export function deviceLabel(ua: string | null | undefined): string {
  if (!ua) return "Browser";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Firefox\//.test(ua)
      ? "Firefox"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Safari\//.test(ua)
          ? "Safari"
          : "Browser";
  const os = /iPhone|iPad/.test(ua)
    ? "iOS"
    : /Android/.test(ua)
      ? "Android"
      : /Mac OS X/.test(ua)
        ? "macOS"
        : /Windows/.test(ua)
          ? "Windows"
          : /Linux/.test(ua)
            ? "Linux"
            : null;
  return os ? `${browser} on ${os}` : browser;
}
