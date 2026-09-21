import "server-only";
import { and, eq, lte, schema } from "@bookly/db";
import { loadEnv } from "@bookly/config";
import type {
  Booking,
  EventType,
  MeetingTranscript,
  TranscriptSegment,
  Workspace,
} from "@bookly/db/schema";
import { db } from "@/lib/db";
import { trackBooking } from "./contacts";
import { api } from "./integrations/types";
import { mergeSegments, parseVtt } from "./transcript-text";

const DAILY = "https://api.daily.co/v1";
const DEFAULT_RETENTION_DAYS = 90;

/** Whether this booking should be transcribed: built-in video, event type on, consent when asked. */
export function captureEnabled(
  booking: Pick<Booking, "meetingProvider" | "captureConsent">,
  eventType: Pick<EventType, "autoCapture"> | null,
) {
  if (!eventType || booking.meetingProvider !== "daily") return false;
  if (eventType.autoCapture === "always") return true;
  if (eventType.autoCapture === "ask") return booking.captureConsent === true;
  return false;
}

export async function getTranscript(bookingId: string): Promise<MeetingTranscript | null> {
  return (
    (await db().query.meetingTranscripts.findFirst({
      where: eq(schema.meetingTranscripts.bookingId, bookingId),
    })) ?? null
  );
}

async function ensureTranscript(ws: Workspace, booking: Booking): Promise<MeetingTranscript> {
  const existing = await getTranscript(booking.id);
  if (existing) return existing;
  const days = ws.settings.capture?.retentionDays ?? DEFAULT_RETENTION_DAYS;
  const [t] = await db()
    .insert(schema.meetingTranscripts)
    .values({
      workspaceId: ws.id,
      bookingId: booking.id,
      startedAt: new Date(),
      expiresAt: days > 0 ? new Date(Date.now() + days * 86_400_000) : null,
      language: ws.settings.capture?.language ?? null,
    })
    .onConflictDoNothing()
    .returning();
  return t ?? (await getTranscript(booking.id))!;
}

/** Starts Daily's transcription for the booking's room (idempotent per booking). */
export async function startTranscription(ws: Workspace, booking: Booking): Promise<boolean> {
  const room = (booking.meetingRef as { room?: string } | null)?.room;
  const key = loadEnv().DAILY_API_KEY;
  if (!room || !key) return false;
  if (booking.transcriptStatus === "recording" || booking.transcriptStatus === "ready") return true;
  const language = ws.settings.capture?.language;
  try {
    await api(`${DAILY}/rooms/${encodeURIComponent(room)}/transcription/start`, {
      method: "POST",
      token: key,
      body: JSON.stringify({
        model: "nova-2",
        punctuate: true,
        ...(language && language !== "auto" ? { language } : {}),
        extra: { diarize: true },
      }),
    });
  } catch (e) {
    console.error("[capture] start transcription failed", e);
    await db()
      .update(schema.bookings)
      .set({ transcriptStatus: "failed" })
      .where(eq(schema.bookings.id, booking.id));
    return false;
  }
  await ensureTranscript(ws, booking);
  await db()
    .update(schema.bookings)
    .set({ transcriptStatus: "recording" })
    .where(eq(schema.bookings.id, booking.id));
  return true;
}

/** Appends live lines posted by the meeting page. Speakers are already host / attendee / name. */
export async function appendLiveSegments(
  ws: Workspace,
  booking: Booking,
  segments: TranscriptSegment[],
) {
  if (!segments.length) return;
  const t = await ensureTranscript(ws, booking);
  const clean = segments
    .filter((s) => typeof s.text === "string" && s.text.trim())
    .map((s) => ({
      t: Math.max(0, Number(s.t) || 0),
      speaker: String(s.speaker).slice(0, 60),
      text: s.text.trim().slice(0, 2000),
    }))
    .slice(0, 200);
  const merged = [...t.segments, ...clean].slice(-5000);
  await db()
    .update(schema.meetingTranscripts)
    .set({ segments: merged, source: t.source === "stored" ? "merged" : "live" })
    .where(eq(schema.meetingTranscripts.id, t.id));
}

/** Daily says the stored transcript is ready: fetch the WebVTT, merge, mark ready, tell the host. */
export async function completeTranscript(
  ws: Workspace,
  booking: Booking,
  transcriptId: string | null,
) {
  const key = loadEnv().DAILY_API_KEY;
  let stored: TranscriptSegment[] = [];
  if (transcriptId && key) {
    try {
      const { link } = await api<{ link: string }>(
        `${DAILY}/transcript/${encodeURIComponent(transcriptId)}/access-link`,
        { token: key },
      );
      const res = await fetch(link);
      if (res.ok) stored = parseVtt(await res.text());
    } catch (e) {
      console.error("[capture] fetch transcript failed", e);
    }
  }
  const t = await ensureTranscript(ws, booking);
  const segments = mergeSegments(t.segments, stored);
  await db()
    .update(schema.meetingTranscripts)
    .set({
      segments,
      providerRef: transcriptId,
      source: t.segments.length && stored.length ? "merged" : stored.length ? "stored" : "live",
      endedAt: new Date(),
    })
    .where(eq(schema.meetingTranscripts.id, t.id));
  const status = segments.length ? "ready" : "failed";
  await db()
    .update(schema.bookings)
    .set({ transcriptStatus: status })
    .where(eq(schema.bookings.id, booking.id));
  if (status !== "ready") return false;
  await trackBooking(ws, booking, "note", `Transcript captured (${segments.length} lines)`);
  const et = booking.eventTypeId
    ? await db().query.eventTypes.findFirst({
        where: eq(schema.eventTypes.id, booking.eventTypeId),
      })
    : null;
  const { generateRecap, notifyRecapReady } = await import("./recaps");
  const recap = await generateRecap(ws, booking, et ?? null).catch((e) => {
    console.error("[recap] failed", e);
    return null;
  });
  await notifyRecapReady(ws, booking, recap);
  return true;
}

export async function markTranscriptFailed(bookingId: string) {
  await db()
    .update(schema.bookings)
    .set({ transcriptStatus: "failed" })
    .where(eq(schema.bookings.id, bookingId));
}

/** Removes the transcript text (host request, attendee request or retention). Summaries stay. */
export async function deleteTranscript(bookingId: string) {
  await db()
    .delete(schema.meetingTranscripts)
    .where(eq(schema.meetingTranscripts.bookingId, bookingId));
  await db()
    .update(schema.bookings)
    .set({ transcriptStatus: "deleted" })
    .where(and(eq(schema.bookings.id, bookingId), eq(schema.bookings.transcriptStatus, "ready")));
}

/** Retention: drop transcripts past their expiry. Called from the reminders tick. */
export async function expireTranscripts(now = new Date()): Promise<number> {
  const rows = await db()
    .select({ bookingId: schema.meetingTranscripts.bookingId })
    .from(schema.meetingTranscripts)
    .where(lte(schema.meetingTranscripts.expiresAt, now))
    .limit(200);
  for (const r of rows) await deleteTranscript(r.bookingId);
  return rows.length;
}

/** Finds the booking behind a Daily room name. */
export async function bookingForRoom(workspaceId: string, room: string): Promise<Booking | null> {
  const rows = await db().query.bookings.findMany({
    where: and(
      eq(schema.bookings.workspaceId, workspaceId),
      eq(schema.bookings.meetingProvider, "daily"),
    ),
  });
  return rows.find((r) => (r.meetingRef as { room?: string } | null)?.room === room) ?? null;
}
