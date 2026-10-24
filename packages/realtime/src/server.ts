import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import pg from "pg";
import { WebSocketServer, type WebSocket } from "ws";
import {
  CLOSE_REAUTH,
  CONNECTION_MAX_MS,
  HEARTBEAT_MS,
  PG_CHANNEL,
  PRESENCE_FLUSH_MS,
  channelsFor,
  decodeEnvelope,
  frame,
  ticketKey,
  verifyTicket,
  type TicketClaims,
} from "./index.ts";

/*
 * The websocket server (ADR 0007). One process holds sockets, keeps their presence rows in
 * Postgres and fans out what the app publishes with `pg_notify`. It runs inside the app (started
 * from instrumentation when REALTIME_PORT is set, behind the `/realtime` rewrite) or on its own
 * (`bin.ts`). Several can run side by side: each delivers to its own sockets.
 */

export type RealtimeServerOptions = {
  port: number;
  /** 127.0.0.1 in-process (only the app's rewrite reaches it); 0.0.0.0 standalone. */
  host?: string;
  /** A direct (unpooled) connection: LISTEN does not survive a transaction pooler. */
  databaseUrl: string;
  authSecret: string;
  log?: (msg: string, err?: unknown) => void;
};

export type RealtimeServer = {
  port: number;
  stats(): { connections: number; listening: boolean };
  close(): Promise<void>;
};

type Conn = {
  id: string;
  socket: WebSocket;
  claims: TicketClaims;
  channels: string[];
  alive: boolean;
  frames: number;
  windowAt: number;
  expire: ReturnType<typeof setTimeout>;
};

/** Per member and server; the oldest goes when a 21st tab connects. */
const MAX_PER_SUBJECT = 20;
/** Heartbeats need one frame per 25 s; anything chattier is not a Bookly tab. */
const MAX_FRAMES_PER_SECOND = 4;
const SWEEP_MS = 60_000;

/** Same SSL-mode normalisation as packages/db (aliases of verify-full, spelled out for pg 9). */
const normalize = (url: string) =>
  url.replace(/([?&])sslmode=(prefer|require|verify-ca)(?=&|$)/, "$1sslmode=verify-full");

export async function startRealtimeServer(opts: RealtimeServerOptions): Promise<RealtimeServer> {
  const log =
    opts.log ??
    ((m, e) => (e ? console.error(`[realtime] ${m}`, e) : console.log(`[realtime] ${m}`)));
  const key = ticketKey(opts.authSecret);
  const node = randomUUID();
  const pool = new pg.Pool({ connectionString: normalize(opts.databaseUrl), max: 3 });
  pool.on("error", (e) => log("database pool error", e));
  const query = (sql: string, params: unknown[]) =>
    pool.query(sql, params).catch((e: unknown) => log("presence write failed", e));

  const conns = new Map<string, Conn>();
  const byChannel = new Map<string, Set<Conn>>();
  const bySubject = new Map<string, Conn[]>();

  /* ---------------- Fan-out ---------------- */

  function deliver(payload: string | undefined) {
    const env = decodeEnvelope(payload);
    if (!env) return;
    const sent = new Set<Conn>();
    const text = frame(env.e, env.d);
    for (const ch of env.to)
      for (const c of byChannel.get(ch) ?? []) {
        if (sent.has(c)) continue;
        sent.add(c);
        c.socket.send(text);
      }
  }

  let listener: pg.Client | null = null;
  let listening = false;
  let closing = false;
  let retry = 1000;
  async function listen() {
    const client = new pg.Client({ connectionString: normalize(opts.databaseUrl) });
    listener = client;
    client.on("notification", (m) => {
      if (m.channel === PG_CHANNEL) deliver(m.payload);
    });
    client.on("error", (e) => {
      log("listener lost; reconnecting", e);
      listening = false;
      client.end().catch(() => {});
      if (!closing) setTimeout(() => void listen(), retry);
      retry = Math.min(retry * 2, 30_000);
    });
    try {
      await client.connect();
      await client.query(`LISTEN ${PG_CHANNEL}`);
      listening = true;
      retry = 1000;
    } catch (e) {
      client.emit("error", e);
    }
  }
  await listen();

  /* ---------------- Connections ---------------- */

  const index = <K, V>(m: Map<K, Set<V>>, k: K) => {
    let s = m.get(k);
    if (!s) m.set(k, (s = new Set()));
    return s;
  };

  function open(socket: WebSocket, claims: TicketClaims) {
    const c: Conn = {
      id: randomUUID(),
      socket,
      claims,
      channels: channelsFor(claims),
      alive: true,
      frames: 0,
      windowAt: Date.now(),
      expire: setTimeout(() => socket.close(CLOSE_REAUTH, "reauth"), CONNECTION_MAX_MS),
    };
    conns.set(c.id, c);
    for (const ch of c.channels) index(byChannel, ch).add(c);
    const subject = `${claims.ws}:${claims.sub}`;
    const mine = [...(bySubject.get(subject) ?? []), c];
    while (mine.length > MAX_PER_SUBJECT) mine.shift()!.socket.close(4002, "too many tabs");
    bySubject.set(subject, mine);
    // Guests have no presence rows until their surfaces exist (ADR 0007, slice R3).
    if (claims.sub.startsWith("m:"))
      void query(
        "insert into realtime_connections (id, workspace_id, user_id, transport, node) values ($1, $2, $3, 'ws', $4) on conflict (id) do nothing",
        [c.id, claims.ws, claims.sub.slice(2), node],
      );

    socket.on("pong", () => (c.alive = true));
    socket.on("message", (data) => {
      c.alive = true;
      const now = Date.now();
      if (now - c.windowAt > 1000) {
        c.windowAt = now;
        c.frames = 0;
      }
      if (++c.frames > MAX_FRAMES_PER_SECOND) return socket.close(4008, "slow down");
      // The only thing a tab says is "still here" ({"t":"hb"}); anything else is ignored.
      void data;
    });
    socket.on("close", () => drop(c));
    socket.on("error", () => drop(c));
    socket.send(JSON.stringify({ t: "hello", id: c.id }));
  }

  function drop(c: Conn) {
    if (!conns.delete(c.id)) return;
    clearTimeout(c.expire);
    for (const ch of c.channels) byChannel.get(ch)?.delete(c);
    const subject = `${c.claims.ws}:${c.claims.sub}`;
    const left = (bySubject.get(subject) ?? []).filter((x) => x !== c);
    if (left.length) bySubject.set(subject, left);
    else bySubject.delete(subject);
    void query("delete from realtime_connections where id = $1", [c.id]);
  }

  /* ---------------- Heartbeats and presence ---------------- */

  const ping = setInterval(() => {
    for (const c of conns.values()) {
      if (!c.alive) {
        c.socket.terminate();
        drop(c);
        continue;
      }
      c.alive = false;
      c.socket.ping();
    }
  }, HEARTBEAT_MS);
  // One statement per server per flush, however many sockets it holds.
  const flush = setInterval(() => {
    const ids = [...conns.values()].filter((c) => c.claims.sub.startsWith("m:")).map((c) => c.id);
    if (ids.length)
      void query("update realtime_connections set seen_at = now() where id = any($1::text[])", [
        ids,
      ]);
  }, PRESENCE_FLUSH_MS);
  // Rows of a process that died stop counting after the presence window; this removes them.
  const sweep = setInterval(() => {
    void query("delete from realtime_connections where seen_at < now() - interval '5 minutes'", []);
  }, SWEEP_MS);

  /* ---------------- HTTP and upgrades ---------------- */

  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 });
  const http = createServer((req, res) => {
    if (req.url?.split("?")[0]?.endsWith("/health")) {
      res.writeHead(listening ? 200 : 503, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: listening, connections: conns.size, listening }));
      return;
    }
    res.writeHead(426, { "content-type": "text/plain" });
    res.end("Bookly realtime: connect with a websocket.");
  });
  http.on("upgrade", (req, socket, head) => {
    const ticket = new URL(req.url ?? "/", "http://realtime").searchParams.get("ticket");
    const claims = verifyTicket(key, ticket);
    if (!claims) {
      socket.end("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => open(ws, claims));
  });
  await new Promise<void>((resolve, reject) => {
    http.once("error", reject);
    http.listen(opts.port, opts.host ?? "127.0.0.1", () => resolve());
  });
  const address = http.address();
  const port = typeof address === "object" && address ? address.port : opts.port;

  return {
    port,
    stats: () => ({ connections: conns.size, listening }),
    async close() {
      closing = true;
      clearInterval(ping);
      clearInterval(flush);
      clearInterval(sweep);
      for (const c of conns.values()) c.socket.close(1012, "restarting");
      await new Promise<void>((resolve) => http.close(() => resolve()));
      // Every row this process wrote, including any whose delete was still in flight.
      await pool.query("delete from realtime_connections where node = $1", [node]).catch(() => {});
      await listener?.end().catch(() => {});
      await pool.end().catch(() => {});
    },
  };
}
