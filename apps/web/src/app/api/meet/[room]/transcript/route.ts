import { NextResponse } from "next/server";
import { z } from "zod";
import { eq, schema } from "@bookly/db";
import { db } from "@/lib/db";
import { rateLimit } from "@/server/api";
import { appendLiveSegments, bookingForRoom, captureEnabled } from "@/server/transcripts";
import { getCurrentWorkspace } from "@/server/workspace";

const body = z.object({
  segments: z
    .array(
      z.object({ t: z.number().min(0), speaker: z.string().max(60), text: z.string().max(2000) }),
    )
    .max(200),
});

/** The meeting page posts live, speaker-labelled transcription lines here while the call runs. */
export async function POST(req: Request, ctx: RouteContext<"/api/meet/[room]/transcript">) {
  const ws = await getCurrentWorkspace();
  const { room } = await ctx.params;
  if (!ws || !/^b-[a-z0-9]+$/.test(room))
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!rateLimit(`live:${room}`, 120, 60_000).ok)
    return NextResponse.json({ error: "Too many" }, { status: 429 });
  const b = await bookingForRoom(ws.id, room);
  if (!b || b.transcriptStatus === "deleted")
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  const et = b.eventTypeId
    ? await db().query.eventTypes.findFirst({ where: eq(schema.eventTypes.id, b.eventTypeId) })
    : null;
  if (!captureEnabled(b, et ?? null))
    return NextResponse.json({ error: "Capture is off" }, { status: 403 });
  let parsed;
  try {
    parsed = body.safeParse(await req.json());
  } catch {
    return NextResponse.json({ error: "Bad body" }, { status: 400 });
  }
  if (!parsed.success) return NextResponse.json({ error: "Bad body" }, { status: 400 });
  await appendLiveSegments(ws, b, parsed.data.segments);
  return NextResponse.json({ ok: true });
}
