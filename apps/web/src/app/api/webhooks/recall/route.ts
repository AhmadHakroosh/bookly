import { NextResponse } from "next/server";
import { eq, schema } from "@bookly/db";
import { loadEnv } from "@bookly/config";
import { db } from "@/lib/db";
import { bookingForBot, verifySvix } from "@/server/integrations/notetaker";
import { enqueue } from "@/server/jobs";
import { markTranscriptFailed, startNotetakerRecording } from "@/server/transcripts";

type StatusEvent = {
  event?: string;
  data?: {
    bot_id?: string;
    status?: { code?: string; sub_code?: string | null; message?: string | null };
  };
};

/**
 * Recall.ai → Bookly: the notetaker's lifecycle. One endpoint for the whole platform (bot ids
 * are global), verified with the Svix signature of the endpoint configured in Recall's dashboard.
 * Recording starts the transcript; the bot finishing hands the download and recap to the queue.
 */
export async function POST(req: Request) {
  const secret = loadEnv().RECALL_WEBHOOK_SECRET;
  if (!secret)
    return NextResponse.json({ error: "RECALL_WEBHOOK_SECRET not set" }, { status: 500 });
  const body = await req.text();
  const ok = verifySvix(
    secret,
    {
      id: req.headers.get("svix-id"),
      timestamp: req.headers.get("svix-timestamp"),
      signature: req.headers.get("svix-signature"),
    },
    body,
  );
  if (!ok) return NextResponse.json({ error: "Bad signature" }, { status: 401 });
  let ev: StatusEvent;
  try {
    ev = JSON.parse(body) as StatusEvent;
  } catch {
    return NextResponse.json({ error: "Bad body" }, { status: 400 });
  }
  const botId = ev.data?.bot_id;
  const code = ev.data?.status?.code ?? ev.event?.replace(/^bot\./, "");
  if (!botId || !code) return NextResponse.json({ ok: true, ignored: "no bot" });
  const b = await bookingForBot(botId);
  if (!b) return NextResponse.json({ ok: true, ignored: "unknown bot" });
  const ws = await db().query.workspaces.findFirst({
    where: eq(schema.workspaces.id, b.workspaceId),
  });
  if (!ws) return NextResponse.json({ ok: true, ignored: "no workspace" });

  switch (code) {
    case "in_call_recording":
      await startNotetakerRecording(ws, b);
      return NextResponse.json({ ok: true });
    case "recording_permission_denied":
    case "fatal": {
      const why = ev.data?.status?.sub_code ?? ev.data?.status?.message ?? code;
      console.warn(`[notetaker] ${code} for booking ${b.id}: ${why}`);
      if (b.transcriptStatus !== "ready") await markTranscriptFailed(b.id);
      return NextResponse.json({ ok: true });
    }
    case "done":
      // Nothing was recorded (never admitted, nobody came): leave the booking untouched.
      if (b.transcriptStatus !== "recording")
        return NextResponse.json({ ok: true, ignored: "not recording" });
      await enqueue(
        "capture.process",
        { workspaceId: ws.id, bookingId: b.id, transcriptId: botId },
        { dedupeId: `capture:${b.id}:${botId}` },
      );
      return NextResponse.json({ ok: true, queued: true });
    default:
      return NextResponse.json({ ok: true, ignored: code });
  }
}
