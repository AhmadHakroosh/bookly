import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { loadEnv } from "@bookly/config";
import { eq, schema, sql } from "@bookly/db";
import type { Booking, TranscriptSegment } from "@bookly/db/schema";
import { db } from "@/lib/db";
import { api } from "./types";

/**
 * Auto-capture on Google Meet, Microsoft Teams and Zoom. Bookly is not inside those calls, so a
 * notetaker bot (Recall.ai) joins the meeting as a participant, streams the transcript to
 * Bookly while the call runs and delivers the full transcript when it ends. From there the
 * pipeline is the same as Bookly video: the transcript store, the recap, tasks and follow-ups.
 *
 * Bookly stores the bot id and a per-booking secret on `bookings.meetingRef.notetaker`; the
 * secret authenticates the real-time transcript webhook, the platform-wide signing secret
 * (`RECALL_WEBHOOK_SECRET`, Svix) authenticates status changes.
 */

export const NOTETAKER_PROVIDERS = new Set(["zoom", "google_meet", "teams"]);

export const notetakerConfigured = () => !!loadEnv().RECALL_API_KEY;

/** What participants read in the meeting chat when the notetaker joins. */
export const recordingNotice = () =>
  `${loadEnv().RECALL_BOT_NAME} is transcribing this call so the host can share notes afterwards. If you would rather not be transcribed, tell the host now and they can end it.`;

/** Whether a location type can be transcribed on this install. */
export function captureSupportsLocation(type: string | undefined | null): boolean {
  if (type === "daily") return true;
  return !!type && NOTETAKER_PROVIDERS.has(type) && notetakerConfigured();
}

export type NotetakerRef = { botId: string; token: string; joinAt: string | null };

const region = () => `https://${loadEnv().RECALL_REGION}.recall.ai`;
const auth = () => {
  const key = loadEnv().RECALL_API_KEY!;
  // Recall accepts the raw key; a value already carrying a scheme ("Token …") is sent as-is.
  return key.includes(" ") ? key : `Token ${key}`;
};

async function recall<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("authorization", auth());
  headers.set("accept", "application/json");
  return api<T>(`${region()}${path}`, { ...init, headers });
}

/** Scheduled bots must be created at least ten minutes ahead; later than that they join now. */
const SCHEDULE_LEAD_MS = 10 * 60_000;

/**
 * Books the bot for a meeting. `maxSeconds` caps the recording (the workspace's remaining
 * minute budget plus a margin) so a runaway call cannot exceed the plan.
 */
export async function scheduleNotetaker(input: {
  booking: Pick<Booking, "id" | "workspaceId" | "startAt" | "endAt">;
  meetingUrl: string;
  language?: string | null;
  maxSeconds: number;
}): Promise<NotetakerRef> {
  const env = loadEnv();
  const token = randomBytes(24).toString("base64url");
  const joinAtMs = input.booking.startAt.getTime() - 60_000;
  const scheduled = joinAtMs - Date.now() > SCHEDULE_LEAD_MS;
  const language = input.language && input.language !== "auto" ? input.language : null;
  const meetingSeconds = Math.max(
    600,
    Math.round((input.booking.endAt.getTime() - input.booking.startAt.getTime()) / 1000) + 3600,
  );
  const bot = await recall<{ id: string }>("/api/v1/bot/", {
    method: "POST",
    body: JSON.stringify({
      meeting_url: input.meetingUrl,
      bot_name: env.RECALL_BOT_NAME,
      ...(scheduled ? { join_at: new Date(joinAtMs).toISOString() } : {}),
      metadata: { bookingId: input.booking.id, workspaceId: input.booking.workspaceId },
      // Announce the transcription in the meeting chat when the bot joins and to everyone who
      // joins later, so participants who never saw the booking page are told too.
      chat: {
        on_join: { send_to: "everyone", message: recordingNotice() },
        on_participant_join: { message: recordingNotice(), exclude_host: false },
      },
      recording_config: {
        transcript: {
          provider: {
            recallai_streaming:
              !language || language === "en"
                ? { mode: "prioritize_low_latency", language_code: "en" }
                : { mode: "prioritize_accuracy", language_code: language },
          },
          diarization: { use_separate_streams_when_available: true },
        },
        realtime_endpoints: [
          {
            type: "webhook",
            url: `${env.APP_URL.replace(/\/$/, "")}/api/webhooks/recall/transcript?token=${token}`,
            events: ["transcript.data"],
          },
        ],
      },
      automatic_leave: {
        waiting_room_timeout: 1200,
        noone_joined_timeout: 1200,
        in_call_recording_timeout: Math.min(input.maxSeconds, meetingSeconds),
      },
    }),
  });
  return { botId: bot.id, token, joinAt: scheduled ? new Date(joinAtMs).toISOString() : null };
}

/** Cancels a scheduled bot, or asks a bot already in the call to leave. Best-effort. */
export async function cancelNotetaker(ref: NotetakerRef): Promise<void> {
  if (!notetakerConfigured()) return;
  try {
    await recall(`/api/v1/bot/${encodeURIComponent(ref.botId)}/`, { method: "DELETE" });
  } catch {
    await recall(`/api/v1/bot/${encodeURIComponent(ref.botId)}/leave_call/`, {
      method: "POST",
    }).catch((e) => console.error("[notetaker] leave failed", e));
  }
}

export async function leaveCall(botId: string): Promise<void> {
  await recall(`/api/v1/bot/${encodeURIComponent(botId)}/leave_call/`, { method: "POST" });
}

/** The booking a bot belongs to (bot ids are unique across the platform). */
export async function bookingForBot(botId: string): Promise<Booking | null> {
  return (
    (await db().query.bookings.findFirst({
      where: sql`${schema.bookings.meetingRef}->'notetaker'->>'botId' = ${botId}`,
    })) ?? null
  );
}

export const notetakerRef = (b: Pick<Booking, "meetingRef">): NotetakerRef | null => {
  const n = (b.meetingRef as { notetaker?: NotetakerRef } | null)?.notetaker;
  return n?.botId && n.token ? n : null;
};

/* ---------------- transcripts ---------------- */

type RecallWord = { text: string; start_timestamp?: { relative?: number } | number | null };
type RecallParticipant = { name?: string | null; is_host?: boolean | null } | null;
type RecallUtterance = { participant?: RecallParticipant; words?: RecallWord[] };

/** Speaker label in Bookly's convention: host / attendee / the display name of anyone else. */
export function speakerLabel(p: RecallParticipant, attendeeName: string): string {
  const name = (p?.name ?? "").trim();
  if (p?.is_host) return "host";
  if (name && name.toLowerCase() === attendeeName.trim().toLowerCase()) return "attendee";
  return name || "attendee";
}

const wordStart = (w: RecallWord): number => {
  const s = w.start_timestamp;
  if (typeof s === "number") return s;
  return typeof s?.relative === "number" ? s.relative : 0;
};

/** One utterance (a real-time event or a line of the stored transcript) → a segment. */
export function segmentFromUtterance(
  u: RecallUtterance,
  attendeeName: string,
): TranscriptSegment | null {
  const words = (u.words ?? []).filter((w) => typeof w.text === "string" && w.text.trim());
  if (!words.length) return null;
  return {
    t: Math.max(0, Math.round(wordStart(words[0]!) * 10) / 10),
    speaker: speakerLabel(u.participant ?? null, attendeeName),
    text: words.map((w) => w.text.trim()).join(" "),
  };
}

/** The downloaded transcript JSON (an array of utterances) → ordered segments. */
export function parseRecallTranscript(json: unknown, attendeeName: string): TranscriptSegment[] {
  if (!Array.isArray(json)) return [];
  return (json as RecallUtterance[])
    .map((u) => segmentFromUtterance(u, attendeeName))
    .filter((s): s is TranscriptSegment => !!s)
    .sort((a, b) => a.t - b.t);
}

/** Fetches the finished transcript for a bot, or [] when none exists yet. */
export async function fetchNotetakerTranscript(
  botId: string,
  attendeeName: string,
): Promise<TranscriptSegment[]> {
  const bot = await recall<{
    recordings?: { media_shortcuts?: { transcript?: { data?: { download_url?: string } } } }[];
  }>(`/api/v1/bot/${encodeURIComponent(botId)}/`);
  const url = bot.recordings?.find((r) => r.media_shortcuts?.transcript?.data?.download_url)
    ?.media_shortcuts?.transcript?.data?.download_url;
  if (!url) return [];
  const res = await fetch(url);
  if (!res.ok) return [];
  return parseRecallTranscript(await res.json(), attendeeName);
}

/* ---------------- webhook verification ---------------- */

/**
 * Status-change webhooks are signed by Svix: HMAC-SHA256 over `id.timestamp.body` with the
 * base64 secret after `whsec_`, compared against any of the space-separated `v1,<sig>` values.
 */
export function verifySvix(
  secret: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  body: string,
  now = Date.now(),
): boolean {
  if (!headers.id || !headers.timestamp || !headers.signature) return false;
  const ts = Number(headers.timestamp);
  if (!Number.isFinite(ts) || Math.abs(now / 1000 - ts) > 300) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key)
    .update(`${headers.id}.${headers.timestamp}.${body}`)
    .digest();
  return headers.signature.split(" ").some((part) => {
    const [version, sig] = part.split(",");
    if (version !== "v1" || !sig) return false;
    const given = Buffer.from(sig, "base64");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

/** Constant-time check of the per-booking token on real-time transcript webhooks. */
export function tokenMatches(given: string | null, expected: string): boolean {
  if (!given || given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

/** Marks a bot's transcript finished on the booking side (no Recall call). */
export async function clearNotetaker(bookingId: string) {
  const b = await db().query.bookings.findFirst({ where: eq(schema.bookings.id, bookingId) });
  if (!b?.meetingRef) return;
  const { notetaker: _n, ...rest } = b.meetingRef as Record<string, unknown>;
  void _n;
  await db().update(schema.bookings).set({ meetingRef: rest }).where(eq(schema.bookings.id, b.id));
}
