import "server-only";
import { and, eq, gt, inArray, lt, schema, sql } from "@bookly/db";
import { loadEnv } from "@bookly/config";
import {
  PG_CHANNEL,
  PRESENCE_WINDOW_MS,
  channels,
  encodeEnvelope,
  signTicket,
  socketUrl,
  ticketKey,
  type RealtimeDriver,
  type RealtimeEvent,
} from "@bookly/realtime";
import { db } from "@/lib/db";

/*
 * Realtime delivery (ADR 0007), the app's side: publish to connected tabs with `pg_notify`
 * (every socket server LISTENs and delivers to its own sockets), ask the presence table who is
 * connected, and sign the tickets tabs open a socket with. The Server-Sent Events fallback
 * writes presence rows too, so `connected()` is right whichever transport a tab uses.
 */

export { channels };

/** The Postgres driver: LISTEN/NOTIFY for fan-out, `realtime_connections` for presence. */
const postgres: RealtimeDriver = {
  async publish(to, event, data) {
    if (!to.length) return;
    await db().execute(sql`select pg_notify(${PG_CHANNEL}, ${encodeEnvelope(to, event, data)})`);
  },
  async connected(workspaceId, userIds) {
    if (!userIds.length) return new Set();
    const rc = schema.realtimeConnections;
    const rows = await db()
      .selectDistinct({ userId: rc.userId })
      .from(rc)
      .where(
        and(
          eq(rc.workspaceId, workspaceId),
          inArray(rc.userId, userIds),
          gt(rc.seenAt, new Date(Date.now() - PRESENCE_WINDOW_MS)),
        ),
      );
    return new Set(rows.map((r) => r.userId).filter((id): id is string => !!id));
  },
};

let driver: RealtimeDriver = postgres;

/** Tests swap the driver; nothing else should. */
export function setRealtimeDriver(d: RealtimeDriver | null) {
  driver = d ?? postgres;
}

/** Sends an event to tabs. Never throws: a tab that misses it catches up from the rows. */
export async function publish(to: string[], event: RealtimeEvent, data: unknown): Promise<void> {
  try {
    await driver.publish(to, event, data);
  } catch (e) {
    console.error("[realtime] publish failed", event, e);
  }
}

/** Whether a member has Bookly open anywhere (any tab, any device, either transport). */
export async function isConnected(workspaceId: string, userId: string): Promise<boolean> {
  return (await connectedMembers(workspaceId, [userId])).has(userId);
}

export async function connectedMembers(workspaceId: string, userIds: string[]) {
  try {
    return await driver.connected(workspaceId, userIds);
  } catch (e) {
    // Unknown presence = not connected: the member gets the fallback rather than nothing.
    console.error("[realtime] presence check failed", e);
    return new Set<string>();
  }
}

/** Where tabs open their socket, or null for Server-Sent Events only. */
export function realtimeUrl(): string | null {
  const env = loadEnv();
  return socketUrl({
    REALTIME_URL: env.REALTIME_URL,
    REALTIME_PORT: env.REALTIME_PORT ? String(env.REALTIME_PORT) : undefined,
  });
}

/** A one-minute ticket for a member's socket; the server checks it, never a cookie. */
export function memberTicket(workspaceId: string, userId: string): string {
  return signTicket(ticketKey(loadEnv().AUTH_SECRET), { ws: workspaceId, sub: `m:${userId}` });
}

/* ---------------- Presence for the Server-Sent Events transport ---------------- */

const SSE_ID = /^[A-Za-z0-9-]{8,64}$/;

/**
 * The SSE stream keeps a row per tab, refreshed while it polls. Streams end every minute and
 * reconnect, so the row is never deleted on close: it simply stops counting a minute after the
 * tab went away, and the housekeeping tick removes it.
 */
export async function ssePresence(workspaceId: string, userId: string, tab: string | null) {
  if (!tab || !SSE_ID.test(tab)) return null;
  const id = `sse:${tab}`;
  const rc = schema.realtimeConnections;
  await db()
    .insert(rc)
    .values({ id, workspaceId, userId, transport: "sse", node: "app" })
    .onConflictDoUpdate({
      target: rc.id,
      set: { seenAt: new Date() },
      // Another member cannot take over a tab id they guessed.
      setWhere: and(eq(rc.workspaceId, workspaceId), eq(rc.userId, userId)),
    });
  return id;
}

/** Rows nobody refreshed for five minutes (closed SSE tabs, a socket server that died). */
export async function prunePresence(now = new Date()) {
  const rows = await db()
    .delete(schema.realtimeConnections)
    .where(lt(schema.realtimeConnections.seenAt, new Date(now.getTime() - 5 * 60_000)))
    .returning({ id: schema.realtimeConnections.id });
  return rows.length;
}
