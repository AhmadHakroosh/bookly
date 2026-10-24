import { hasFlag } from "@/server/flags";
import { canGuest, canTeam, messagesPulse } from "@/server/messages";
import { markSeen, unreadCount } from "@/server/notifications";
import { memberTicket, realtimeUrl } from "@/server/realtime";
import { getSession, getStaffRole } from "@/server/session";
import { getCurrentWorkspace } from "@/server/workspace";

/*
 * What a tab's live connection asks in the background (ADR 0007): a socket ticket, the numbers
 * to catch up on after (re)connecting, and which notifications it showed. A route handler, not
 * server actions, so these calls never queue in front of what the member is doing (a page runs
 * its server actions one at a time).
 */

async function member() {
  const [session, role, ws] = await Promise.all([
    getSession(),
    getStaffRole(),
    getCurrentWorkspace(),
  ]);
  if (!session || !role || !ws || !(await hasFlag(ws, "notifications"))) return null;
  return { userId: session.user.id, ws };
}

const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "cache-control": "no-store" } });

export type LiveState = {
  unread: number;
  messages: { unread: number; latest: string | null } | null;
};

/** `?ticket`: where to open the socket and a one-minute ticket (null: Server-Sent Events only). */
export async function GET(req: Request) {
  const m = await member();
  if (!m) return json({ error: "Sign in first." }, 401);
  if (new URL(req.url).searchParams.has("ticket")) {
    const url = realtimeUrl();
    return json(url ? { url, ticket: memberTicket(m.ws.id, m.userId) } : null);
  }
  const messagesOn = (await hasFlag(m.ws, "messages")) && (canGuest(m.ws) || canTeam(m.ws));
  const [unread, messages] = await Promise.all([
    unreadCount(m.ws.id, m.userId),
    messagesOn ? messagesPulse(m) : null,
  ]);
  return json({ unread, messages } satisfies LiveState);
}

/**
 * `{ "seen": [ids] }`: the tab showed these (visible, or as a desktop notification), so what
 * was held back for them is not sent. JSON only, which a cross-site form cannot send.
 */
export async function POST(req: Request) {
  if (!req.headers.get("content-type")?.startsWith("application/json"))
    return json({ error: "JSON only." }, 415);
  const m = await member();
  if (!m) return json({ error: "Sign in first." }, 401);
  const body = (await req.json().catch(() => null)) as { seen?: unknown } | null;
  const ids = Array.isArray(body?.seen)
    ? body.seen.filter((i): i is string => typeof i === "string")
    : [];
  return json({ seen: await markSeen(m.ws.id, m.userId, ids) });
}
