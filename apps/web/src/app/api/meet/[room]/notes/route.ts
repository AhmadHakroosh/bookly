import { NextResponse } from "next/server";
import { audit } from "@/server/audit";
import { getNotes, noteableRoom, saveNotes } from "@/server/meeting-notes";
import { rateLimit } from "@/server/ratelimit";
import { getSession } from "@/server/session";

/*
 * The in-call notes panel (0.20.0): GET loads the signed-in member's own notes for the room's
 * booking, PUT autosaves them (the whole list). Only members of the booking's workspace, on a
 * plan and flag with notes; works on the dedicated meeting host too (the session cookie is
 * scoped to the root domain, and the room names its booking).
 */

async function access(room: string) {
  const session = await getSession();
  if (!session) return null;
  const found = await noteableRoom(room, session.user.id);
  return found ? { ...found, userId: session.user.id } : null;
}

export async function GET(_req: Request, ctx: RouteContext<"/api/meet/[room]/notes">) {
  const { room } = await ctx.params;
  const a = await access(room);
  if (!a) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const row = await getNotes(a.booking.id, a.userId);
  return NextResponse.json({ entries: row?.entries ?? [] });
}

export async function PUT(req: Request, ctx: RouteContext<"/api/meet/[room]/notes">) {
  const { room } = await ctx.params;
  const a = await access(room);
  if (!a) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await rateLimit(`notes:${a.userId}:${room}`, 120, 60_000)).ok)
    return NextResponse.json({ error: "Too many" }, { status: 429 });
  let body: { entries?: unknown };
  try {
    body = (await req.json()) as { entries?: unknown };
  } catch {
    return NextResponse.json({ error: "Bad body" }, { status: 400 });
  }
  const r = await saveNotes(a.ws, a.booking, a.userId, body.entries);
  // The first save starts the notes; autosaves after it are not activity worth a log line each.
  if (r.created)
    await audit({
      workspace: a.ws.id,
      action: "meeting.notes_started",
      target: { type: "booking", id: a.booking.id, label: a.booking.attendeeName },
    });
  return NextResponse.json({ ok: true, count: r.entries.length });
}
