import { NextResponse } from "next/server";
import { eq, schema } from "@bookly/db";
import { db } from "@/lib/db";
import { fmtDateTime } from "@/lib/time";
import { verifyDailySignature } from "@/server/integrations";
import { notifyHost } from "@/server/notify";
import { getProfileByUser } from "@/server/scheduling";
import {
  bookingForRoom,
  captureEnabled,
  markTranscriptFailed,
  startTranscription,
} from "@/server/transcripts";
import { getCurrentWorkspace } from "@/server/workspace";
import { enqueue } from "@/server/jobs";

type DailyEvent = {
  type: string;
  payload?: {
    room?: string;
    room_name?: string;
    user_name?: string | null;
    user_id?: string | null;
    transcriptId?: string;
    transcript_id?: string;
    id?: string;
  };
};

/** Daily's registration probe: a body of exactly {"test":"test"}, no event. */
export function isProbe(body: string): boolean {
  try {
    const v = JSON.parse(body) as { test?: unknown; type?: unknown };
    return v?.test === "test" && v.type === undefined;
  } catch {
    return false;
  }
}

/**
 * Daily.co → Bookly. `participant.joined` pings the host and, once both sides are in the room,
 * starts transcription for auto-capture event types. `transcript.*` finish or fail a capture.
 */
export async function POST(req: Request) {
  const body = await req.text();
  // Daily verifies a new webhook with {"test":"test"} and needs a 200 within 8 seconds. The
  // signing key is only stored once registration succeeds, so answer before checking anything.
  if (isProbe(body)) return NextResponse.json({ ok: true });
  const ws = await getCurrentWorkspace();
  const hmac = ws?.settings.daily?.hmac;
  if (!ws || !hmac) return NextResponse.json({ error: "Webhook not registered" }, { status: 404 });
  const ts = req.headers.get("x-webhook-timestamp") ?? "";
  const sig = req.headers.get("x-webhook-signature") ?? "";
  if (!ts || !sig || !verifyDailySignature(hmac, ts, sig, body))
    return NextResponse.json({ error: "Bad signature" }, { status: 401 });
  const ev = JSON.parse(body) as DailyEvent;
  const room = ev.payload?.room ?? ev.payload?.room_name;
  if (!room) return NextResponse.json({ ok: true, ignored: "no room" });
  const b = await bookingForRoom(ws.id, room);
  if (!b) return NextResponse.json({ ok: true, ignored: "unknown room" });
  const et = b.eventTypeId
    ? await db().query.eventTypes.findFirst({ where: eq(schema.eventTypes.id, b.eventTypeId) })
    : null;

  if (ev.type === "transcript.ready-to-download") {
    const id = ev.payload?.transcriptId ?? ev.payload?.transcript_id ?? ev.payload?.id ?? null;
    // Download + recap can take a minute: hand it to the job queue and answer Daily at once.
    await enqueue(
      "capture.process",
      { workspaceId: ws.id, bookingId: b.id, transcriptId: id },
      { dedupeId: `capture:${b.id}:${id ?? "live"}` },
    );
    return NextResponse.json({ ok: true, queued: true });
  }
  if (ev.type === "transcript.error") {
    await markTranscriptFailed(b.id);
    return NextResponse.json({ ok: true });
  }
  if (ev.type !== "participant.joined") return NextResponse.json({ ok: true, ignored: ev.type });

  const host = await getProfileByUser(ws.id, b.hostUserId);
  const who = ev.payload?.user_name?.trim() || "Someone";
  const isHost = !!host && who.toLowerCase() === host.displayName.toLowerCase();

  // Presence: remember who has been in the room so transcription starts once both sides are in.
  const ref = (b.meetingRef ?? {}) as Record<string, unknown> & { joined?: string[] };
  const joined = new Set(ref.joined ?? []);
  joined.add(isHost ? "host" : `attendee:${who}`);
  await db()
    .update(schema.bookings)
    .set({ meetingRef: { ...ref, joined: [...joined] } })
    .where(eq(schema.bookings.id, b.id));
  const bothIn = joined.has("host") && [...joined].some((j) => j.startsWith("attendee:"));
  if (bothIn && captureEnabled(b, et ?? null) && b.transcriptStatus !== "recording")
    await startTranscription(ws, b).catch((e) => console.error("[capture]", e));

  // The host joining their own room is not news.
  if (isHost) return NextResponse.json({ ok: true, ignored: "host" });
  const key = "joined";
  if (b.remindersSent.includes(key))
    return NextResponse.json({ ok: true, ignored: "already notified" });
  await db()
    .update(schema.bookings)
    .set({ remindersSent: [...b.remindersSent, key] })
    .where(eq(schema.bookings.id, b.id));
  const text = `${who} just joined your ${et?.title ?? "meeting"} (${fmtDateTime(b.startAt, host?.timezone ?? ws.timezone)}). Join: ${b.meetingUrl}`;
  await notifyHost(b.hostUserId, "onJoin", {
    subject: `${who} joined your call`,
    text,
    email: { subject: `${who} joined your call`, text },
  });
  return NextResponse.json({ ok: true });
}
