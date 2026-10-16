import { hasFlag } from "@/server/flags";
import {
  decodeCursor,
  encodeCursor,
  notificationsAfter,
  streamStart,
  toClient,
  unreadCount,
} from "@/server/notifications";
import { getSession, getStaffRole } from "@/server/session";
import { getCurrentWorkspace } from "@/server/workspace";

/*
 * The bell's live feed (Server-Sent Events). The table is the fan-out: each open admin tab holds
 * one stream that checks the member's rows every few seconds and sends what is new plus the
 * unread count when it changes. A stream lives under a minute (serverless limits); EventSource
 * reconnects by itself with Last-Event-ID, so nothing is missed between two streams.
 */

export const maxDuration = 60;

const WINDOW_MS = 50_000;
const POLL_MS = 4_000;

const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => (clearTimeout(t), resolve()), { once: true });
  });

export async function GET(req: Request) {
  const [session, role, ws] = await Promise.all([
    getSession(),
    getStaffRole(),
    getCurrentWorkspace(),
  ]);
  if (!session || !role || !ws) return new Response("Sign in first.", { status: 401 });
  if (!(await hasFlag(ws, "notifications"))) return new Response("Not enabled.", { status: 404 });
  const userId = session.user.id;
  let cursor = decodeCursor(req.headers.get("last-event-id")) ?? (await streamStart(ws.id, userId));
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (s: string) => controller.enqueue(enc.encode(s));
      const send = (event: string, data: unknown, id?: string) =>
        write(`${id ? `id: ${id}\n` : ""}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      write("retry: 3000\n\n");
      let lastCount = -1;
      const started = Date.now();
      try {
        while (!req.signal.aborted && Date.now() - started < WINDOW_MS) {
          const rows = await notificationsAfter(ws.id, userId, cursor);
          for (const r of rows) {
            cursor = { createdAt: r.createdAt.toISOString(), id: r.id };
            send("notification", toClient(r), encodeCursor(r));
          }
          const count = await unreadCount(ws.id, userId);
          if (count !== lastCount) send("count", { unread: count });
          // A comment keeps proxies from closing a quiet connection.
          else write(": ping\n\n");
          lastCount = count;
          await wait(POLL_MS, req.signal);
        }
      } catch (e) {
        if (!req.signal.aborted) console.error("[notifications] stream failed", e);
      } finally {
        try {
          controller.close();
        } catch {
          // Already closed by the client going away.
        }
      }
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    },
  });
}
