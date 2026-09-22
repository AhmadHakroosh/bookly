import { NextResponse } from "next/server";
import { eq, schema } from "@bookly/db";
import { db } from "@/lib/db";
import {
  bookingForBot,
  notetakerRef,
  segmentFromUtterance,
  tokenMatches,
} from "@/server/integrations/notetaker";
import { rateLimit } from "@/server/ratelimit";
import { appendLiveSegments, captureEnabled } from "@/server/transcripts";

type RealtimeEvent = {
  event?: string;
  data?: {
    data?: {
      words?: { text: string; start_timestamp?: { relative?: number } }[];
      participant?: { name?: string | null; is_host?: boolean | null } | null;
    };
    bot?: { id?: string };
  };
};

/**
 * Recall.ai → Bookly, while the call runs: one `transcript.data` event per finished utterance.
 * The URL carries the per-booking token the bot was created with; the bot id in the payload
 * must belong to the same booking.
 */
export async function POST(req: Request) {
  const token = new URL(req.url).searchParams.get("token");
  let ev: RealtimeEvent;
  try {
    ev = (await req.json()) as RealtimeEvent;
  } catch {
    return NextResponse.json({ error: "Bad body" }, { status: 400 });
  }
  const botId = ev.data?.bot?.id;
  if (!botId || !token) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await rateLimit(`notetaker:${botId}`, 600, 60_000)).ok)
    return NextResponse.json({ error: "Too many" }, { status: 429 });
  const b = await bookingForBot(botId);
  const ref = b ? notetakerRef(b) : null;
  if (!b || !ref || !tokenMatches(token, ref.token) || b.transcriptStatus === "deleted")
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (ev.event !== "transcript.data") return NextResponse.json({ ok: true, ignored: ev.event });
  const [ws, et] = await Promise.all([
    db().query.workspaces.findFirst({ where: eq(schema.workspaces.id, b.workspaceId) }),
    b.eventTypeId
      ? db().query.eventTypes.findFirst({ where: eq(schema.eventTypes.id, b.eventTypeId) })
      : null,
  ]);
  if (!ws || !captureEnabled(b, et ?? null))
    return NextResponse.json({ error: "Capture is off" }, { status: 403 });
  const seg = segmentFromUtterance(ev.data?.data ?? {}, b.attendeeName);
  if (seg) await appendLiveSegments(ws, b, [seg]);
  return NextResponse.json({ ok: true });
}
