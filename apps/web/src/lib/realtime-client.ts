"use client";

import { realtimeTicketAction } from "@/app/(admin)/admin/notifications/feed-actions";

/*
 * The tab's one live connection (ADR 0007): a websocket when the install has a socket server,
 * otherwise (or when the socket keeps failing) the Server-Sent Events stream. Either way the
 * server counts the tab as present, so `notify()` holds email and push back while it is open.
 * Delivery is at most once: listeners refresh from the server on every (re)connect.
 */

export type Transport = "connecting" | "socket" | "sse" | "off";
type Handler = (data: unknown) => void;

const HEARTBEAT_MS = 25_000;
/** Opens that fail in a row before the tab settles for Server-Sent Events. */
const MAX_FAILURES = 3;
/** How often a tab on Server-Sent Events tries the socket again. */
const SOCKET_RETRY_MS = 5 * 60_000;
const SSE_EVENTS = ["notification", "count", "messages"] as const;

const handlers = new Map<string, Set<Handler>>();
const connectListeners = new Set<() => void>();
const transportListeners = new Set<() => void>();
const tabId =
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

let users = 0;
let transport: Transport = "off";
let socket: WebSocket | null = null;
let stream: EventSource | null = null;
let heartbeat: ReturnType<typeof setInterval> | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let failures = 0;

function setTransport(t: Transport) {
  if (transport === t) return;
  transport = t;
  for (const l of transportListeners) l();
}

function emit(event: string, data: unknown) {
  for (const h of handlers.get(event) ?? []) h(data);
}

function connected(t: Transport) {
  setTransport(t);
  for (const l of connectListeners) l();
}

function later(fn: () => void, ms: number) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    fn();
  }, ms);
}

/* ---------------- Server-Sent Events (fallback) ---------------- */

function openStream() {
  if (stream || !users) return;
  const es = new EventSource(`/admin/notifications/stream?tab=${encodeURIComponent(tabId)}`);
  stream = es;
  es.onopen = () => connected("sse");
  for (const name of SSE_EVENTS)
    es.addEventListener(name, (e) => emit(name, JSON.parse((e as MessageEvent).data)));
  es.onerror = () => {
    // CONNECTING = the stream ended normally and the browser reconnects; CLOSED = refused.
    if (es.readyState === EventSource.CLOSED) {
      stream = null;
      setTransport("off");
    }
  };
}

function closeStream() {
  stream?.close();
  stream = null;
}

/* ---------------- Websocket ---------------- */

async function openSocket() {
  if (socket || !users) return;
  setTransport(stream ? transport : "connecting");
  const t = await realtimeTicketAction().catch(() => null);
  if (!users) return;
  if (!t) {
    // No socket server on this install: Server-Sent Events it is.
    openStream();
    return;
  }
  const base = t.url.startsWith("/")
    ? `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}${t.url}`
    : t.url;
  const ws = new WebSocket(
    `${base}${base.includes("?") ? "&" : "?"}ticket=${encodeURIComponent(t.ticket)}`,
  );
  socket = ws;
  let opened = false;
  ws.onopen = () => {
    opened = true;
    failures = 0;
    closeStream();
    heartbeat = setInterval(() => ws.send('{"t":"hb"}'), HEARTBEAT_MS);
    connected("socket");
  };
  ws.onmessage = (e) => {
    try {
      const f = JSON.parse(String(e.data)) as { t?: string; e?: string; d?: unknown };
      if (f.t === "event" && f.e) emit(f.e, f.d);
    } catch {
      // Not ours.
    }
  };
  ws.onclose = () => {
    if (heartbeat) clearInterval(heartbeat);
    heartbeat = null;
    if (socket === ws) socket = null;
    if (!users) return;
    if (!opened) failures++;
    if (failures >= MAX_FAILURES) {
      failures = 0;
      openStream();
      later(() => void openSocket(), SOCKET_RETRY_MS);
      return;
    }
    // Reconnect with backoff and jitter (also after the server's hourly re-auth close).
    const wait = opened ? 500 : Math.min(30_000, 1000 * 2 ** failures);
    later(() => void openSocket(), wait * (0.5 + Math.random()));
  };
}

/* ---------------- API ---------------- */

/** Listens for one event; the first listener opens the connection, the last one closes it. */
export function subscribe(event: string, handler: Handler): () => void {
  let set = handlers.get(event);
  if (!set) handlers.set(event, (set = new Set()));
  set.add(handler);
  if (users++ === 0) void openSocket();
  return () => {
    set.delete(handler);
    if (--users === 0) {
      if (timer) clearTimeout(timer);
      timer = null;
      socket?.close();
      socket = null;
      closeStream();
      setTransport("off");
    }
  };
}

/** Called after every (re)connect, so listeners can refresh what they may have missed. */
export function onConnect(cb: () => void): () => void {
  connectListeners.add(cb);
  return () => connectListeners.delete(cb);
}

export const currentTransport = () => transport;

export function onTransport(cb: () => void): () => void {
  transportListeners.add(cb);
  return () => transportListeners.delete(cb);
}
