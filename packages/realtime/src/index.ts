import { createHmac, timingSafeEqual } from "node:crypto";

/*
 * Realtime delivery (ADR 0007): the parts both sides share, with no I/O. The app publishes
 * envelopes with `pg_notify` and asks the presence table who is connected; the socket server
 * (`./server`) verifies tickets, holds the sockets, keeps presence and fans envelopes out.
 */

/** The Postgres channel every socket server LISTENs on. */
export const PG_CHANNEL = "bookly_realtime";

/** A member counts as connected while one of their connections was seen this recently. */
export const PRESENCE_WINDOW_MS = 60_000;
/** Clients send a heartbeat this often; servers refresh `seen_at` a little faster. */
export const HEARTBEAT_MS = 25_000;
export const PRESENCE_FLUSH_MS = 20_000;
/** A ticket only opens a connection; this is how long it may wait to be used. */
export const TICKET_TTL_MS = 60_000;
/** Then the connection is closed with CLOSE_REAUTH and the client asks for a fresh ticket. */
export const CONNECTION_MAX_MS = 60 * 60_000;
export const CLOSE_REAUTH = 4001;
/** `pg_notify` payloads are limited to 8000 bytes; bigger events become a refresh hint. */
export const MAX_ENVELOPE_BYTES = 7000;

/** Who a connection belongs to: a member (`m:<userId>`) or, with guest surfaces, a contact. */
export type Subject = `m:${string}` | `g:${string}`;

export type TicketClaims = { v: 1; ws: string; sub: Subject; exp: number };

/* ---------------- Channels ---------------- */

export const channels = {
  /** One member of one workspace: every tab and device they have open. */
  member: (workspaceId: string, userId: string) => `m:${workspaceId}:${userId}`,
  /** Every member of a workspace (guest threads, which all members see). */
  members: (workspaceId: string) => `w:${workspaceId}`,
  /** A guest (contact) on a capability link (ADR 0007, slice R3). */
  guest: (workspaceId: string, contactId: string) => `g:${workspaceId}:${contactId}`,
};

/** The channels a connection listens on, built only from verified claims. */
export function channelsFor(c: Pick<TicketClaims, "ws" | "sub">): string[] {
  const id = c.sub.slice(2);
  return c.sub.startsWith("m:")
    ? [channels.member(c.ws, id), channels.members(c.ws)]
    : [channels.guest(c.ws, id)];
}

/* ---------------- Events ---------------- */

/** What the app sends to tabs. `refresh` replaces data too big for one notification. */
export type RealtimeEvent = "notification" | "count" | "messages" | (string & Record<never, never>);

export type Envelope = { to: string[]; e: RealtimeEvent; d: unknown };

/** The payload for `pg_notify`, kept under the size limit. */
export function encodeEnvelope(to: string[], event: RealtimeEvent, data: unknown): string {
  const full = JSON.stringify({ to, e: event, d: data } satisfies Envelope);
  if (Buffer.byteLength(full) <= MAX_ENVELOPE_BYTES) return full;
  return JSON.stringify({ to, e: event, d: { refresh: true } } satisfies Envelope);
}

export function decodeEnvelope(payload: string | undefined): Envelope | null {
  if (!payload) return null;
  try {
    const v = JSON.parse(payload) as Partial<Envelope>;
    if (!Array.isArray(v.to) || typeof v.e !== "string") return null;
    return { to: v.to.filter((x): x is string => typeof x === "string"), e: v.e, d: v.d ?? null };
  } catch {
    return null;
  }
}

/** One frame from server to client. */
export const frame = (event: RealtimeEvent, data: unknown) =>
  JSON.stringify({ t: "event", e: event, d: data });

/* ---------------- Tickets ---------------- */

/** The signing key, derived from AUTH_SECRET so there is no new secret to configure. */
export const ticketKey = (authSecret: string) =>
  createHmac("sha256", authSecret).update("bookly-realtime-v1").digest();

const sign = (key: Buffer, body: string) =>
  createHmac("sha256", key).update(body).digest("base64url");

export function signTicket(key: Buffer, c: { ws: string; sub: Subject }, now = Date.now()): string {
  const body = Buffer.from(
    JSON.stringify({ v: 1, ws: c.ws, sub: c.sub, exp: now + TICKET_TTL_MS } satisfies TicketClaims),
  ).toString("base64url");
  return `${body}.${sign(key, body)}`;
}

export function verifyTicket(key: Buffer, ticket: unknown, now = Date.now()): TicketClaims | null {
  if (typeof ticket !== "string" || ticket.length > 1000) return null;
  const [body, mac, extra] = ticket.split(".");
  if (!body || !mac || extra !== undefined) return null;
  const expected = Buffer.from(sign(key, body));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const c = JSON.parse(Buffer.from(body, "base64url").toString()) as Partial<TicketClaims>;
    if (c.v !== 1 || typeof c.ws !== "string" || !c.ws || typeof c.exp !== "number") return null;
    if (typeof c.sub !== "string" || !/^[mg]:.+/.test(c.sub)) return null;
    if (c.exp < now) return null;
    return c as TicketClaims;
  } catch {
    return null;
  }
}

/* ---------------- Drivers ---------------- */

/**
 * How the app reaches connected people. Bookly ships one driver (Postgres LISTEN/NOTIFY and the
 * presence table, in the app's `server/realtime.ts`); a hosted provider would implement the same.
 */
export interface RealtimeDriver {
  publish(to: string[], event: RealtimeEvent, data: unknown): Promise<void>;
  /** Members of the workspace (of those asked) with a live connection. */
  connected(workspaceId: string, userIds: string[]): Promise<Set<string>>;
}

/**
 * Where browsers connect, from REALTIME_URL / REALTIME_PORT: a path on the app's own origin
 * (the in-process server behind the `/realtime` rewrite), an absolute ws(s) URL, or null (the
 * Server-Sent Events transport only).
 */
export function socketUrl(env: { REALTIME_URL?: string; REALTIME_PORT?: string }): string | null {
  const url = env.REALTIME_URL?.trim();
  if (url) return /^(wss?:\/\/|\/)/.test(url) ? url : null;
  return env.REALTIME_PORT ? "/realtime" : null;
}
