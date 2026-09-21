import "server-only";
import { randomBytes } from "node:crypto";
import { eq, schema } from "@bookly/db";
import { loadEnv } from "@bookly/config";
import type { Integration, WatchChannel } from "@bookly/db/schema";
import { db } from "@/lib/db";
import { api } from "./types";

/**
 * Calendar push notifications. Google and Microsoft call us when a watched calendar changes so
 * the cached busy time is dropped at once instead of after the 60-second TTL. Channels are
 * short-lived by design and renewed by the `calendar.sync` job / cron tick.
 */

const GOOGLE = "https://www.googleapis.com/calendar/v3";
const GRAPH = "https://graph.microsoft.com/v1.0";
/** Google allows up to a week; Graph caps calendar subscriptions at 4230 minutes. */
const GOOGLE_TTL_S = 7 * 86_400;
const GRAPH_TTL_MIN = 4230;
/** Renew when less than this is left. */
const RENEW_WINDOW_MS = 24 * 3600_000;

export const webhookUrl = (provider: "google" | "microsoft") =>
  `${loadEnv().APP_URL.replace(/\/$/, "")}/api/webhooks/calendar/${provider}`;

/** Providers only deliver to public HTTPS endpoints; local http servers get no channels. */
export const pushSupported = () => webhookUrl("google").startsWith("https://");

export const watchToken = (integrationId: string, secret: string) => `${integrationId}:${secret}`;

/** Splits the token/clientState a provider echoes back; null when malformed. */
export function parseWatchToken(token: string | null | undefined) {
  if (!token) return null;
  const i = token.indexOf(":");
  if (i <= 0) return null;
  return { integrationId: token.slice(0, i), secret: token.slice(i + 1) };
}

export function googleWatchBody(channelId: string, token: string) {
  return {
    id: channelId,
    type: "web_hook",
    address: webhookUrl("google"),
    token,
    params: { ttl: String(GOOGLE_TTL_S) },
  };
}

export function microsoftSubscriptionBody(
  calendarId: string,
  clientState: string,
  now = new Date(),
) {
  return {
    changeType: "created,updated,deleted",
    notificationUrl: webhookUrl("microsoft"),
    resource: `me/calendars/${calendarId}/events`,
    expirationDateTime: new Date(now.getTime() + GRAPH_TTL_MIN * 60_000).toISOString(),
    clientState,
  };
}

async function openChannel(
  i: Integration,
  token: string,
  calendarId: string,
): Promise<WatchChannel> {
  const secret = randomBytes(16).toString("base64url");
  const state = watchToken(i.id, secret);
  if (i.provider === "google") {
    const channelId = crypto.randomUUID();
    const res = await api<{ resourceId: string; expiration: string }>(
      `${GOOGLE}/calendars/${encodeURIComponent(calendarId)}/events/watch`,
      { method: "POST", token, body: JSON.stringify(googleWatchBody(channelId, state)) },
    );
    return {
      calendarId,
      id: channelId,
      resourceId: res.resourceId,
      secret,
      expiresAt: new Date(Number(res.expiration)).toISOString(),
    };
  }
  const res = await api<{ id: string; expirationDateTime: string }>(`${GRAPH}/subscriptions`, {
    method: "POST",
    token,
    body: JSON.stringify(microsoftSubscriptionBody(calendarId, state)),
  });
  return { calendarId, id: res.id, secret, expiresAt: res.expirationDateTime };
}

async function closeChannel(i: Integration, token: string, c: WatchChannel) {
  try {
    if (i.provider === "google")
      await api(`${GOOGLE}/channels/stop`, {
        method: "POST",
        token,
        body: JSON.stringify({ id: c.id, resourceId: c.resourceId }),
      });
    else
      await api(`${GRAPH}/subscriptions/${encodeURIComponent(c.id)}`, { method: "DELETE", token });
  } catch (e) {
    // Already gone is fine; anything else is logged and the channel forgotten.
    if ((e as { status?: number }).status !== 404) console.error("[calendar] stop channel", e);
  }
}

async function save(i: Integration, watch: WatchChannel[]) {
  await db().update(schema.integrations).set({ watch }).where(eq(schema.integrations.id, i.id));
}

/**
 * Makes the channel set match the conflict calendars: opens missing ones, renews those about to
 * expire, closes the rest. `token` is a valid access token for the integration.
 */
export async function ensureWatches(i: Integration, token: string, now = new Date()) {
  if (!pushSupported() || (i.provider !== "google" && i.provider !== "microsoft")) return;
  const wanted = new Set(i.settings.conflictCalendarIds ?? []);
  const next: WatchChannel[] = [];
  for (const c of i.watch) {
    const fresh = new Date(c.expiresAt).getTime() - now.getTime() > RENEW_WINDOW_MS;
    if (wanted.has(c.calendarId) && fresh) {
      next.push(c);
      continue;
    }
    if (wanted.has(c.calendarId) && i.provider === "microsoft") {
      // Graph subscriptions can be extended in place.
      try {
        const res = await api<{ expirationDateTime: string }>(
          `${GRAPH}/subscriptions/${encodeURIComponent(c.id)}`,
          {
            method: "PATCH",
            token,
            body: JSON.stringify({
              expirationDateTime: new Date(now.getTime() + GRAPH_TTL_MIN * 60_000).toISOString(),
            }),
          },
        );
        next.push({ ...c, expiresAt: res.expirationDateTime });
        continue;
      } catch {
        /* fall through: recreate below */
      }
    }
    await closeChannel(i, token, c);
  }
  for (const calendarId of wanted) {
    if (next.some((c) => c.calendarId === calendarId)) continue;
    try {
      next.push(await openChannel(i, token, calendarId));
    } catch (e) {
      console.error(`[calendar] watch ${i.provider}/${calendarId} failed`, e);
    }
  }
  await save(i, next);
}

export async function stopWatches(i: Integration, token: string) {
  for (const c of i.watch) await closeChannel(i, token, c);
  await save(i, []);
}

/** Finds the integration a notification belongs to and checks its secret. */
export async function verifyNotification(token: string | null | undefined) {
  const parsed = parseWatchToken(token);
  if (!parsed) return null;
  const i = await db().query.integrations.findFirst({
    where: eq(schema.integrations.id, parsed.integrationId),
  });
  if (!i || !i.watch.some((c) => c.secret === parsed.secret)) return null;
  return i;
}
