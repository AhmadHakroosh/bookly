import { createHmac, timingSafeEqual } from "node:crypto";
import { loadEnv } from "@bookly/config";
import { api, type ConferencingDriver, type MeetingSpec } from "./types";

const BASE = "https://api.daily.co/v1";

export function dailyConfigured() {
  const e = loadEnv();
  return !!(e.DAILY_API_KEY && e.DAILY_DOMAIN);
}

/** Public URL of the meeting page for a room (our /meet page wraps Daily Prebuilt). */
export function meetPageUrl(room: string) {
  const e = loadEnv();
  const base = (e.MEET_URL ?? `${e.APP_URL}/meet`).replace(/\/$/, "");
  return `${base}/${room}`;
}

export function dailyRoomUrl(room: string) {
  return `https://${loadEnv().DAILY_DOMAIN}/${room}`;
}

export function roomName(bookingId: string) {
  return `b-${bookingId
    .replace(/[^a-z0-9]/gi, "")
    .slice(0, 24)
    .toLowerCase()}`;
}

/** Request body for POST /rooms — exported for tests. */
export function dailyRoomBody(spec: MeetingSpec) {
  return {
    name: roomName(spec.bookingId),
    privacy: "public",
    properties: {
      exp: Math.floor(spec.end.getTime() / 1000) + 2 * 60 * 60,
      enable_prejoin_ui: true,
      enable_chat: true,
      enable_advanced_chat: true,
      enable_emoji_reactions: true,
      enable_hand_raising: true,
      enable_pip_ui: true,
      enable_people_ui: true,
      enable_screenshare: true,
      enable_video_processing_ui: true,
      enable_noise_cancellation_ui: true,
      eject_at_room_exp: true,
      max_participants: 10,
      ...(spec.transcription ? { enable_transcription_storage: true } : {}),
    },
  };
}

/** Events the workspace webhook subscribes to: joins (notifications) and transcripts (auto-capture). */
export const DAILY_WEBHOOK_EVENTS = [
  "participant.joined",
  "transcript.ready-to-download",
  "transcript.error",
] as const;

/** Registers (or replaces) the Daily webhook that reports participant joins. Returns its HMAC key. */
export async function registerDailyWebhook(url: string, previousId?: string | null) {
  if (!dailyConfigured()) throw new Error("Built-in video is not configured");
  const key = loadEnv().DAILY_API_KEY!;
  if (previousId)
    await api(`${BASE}/webhooks/${previousId}`, { method: "DELETE", token: key }).catch(() => {});
  const hook = await api<{ uuid: string; hmac: string; url: string }>(`${BASE}/webhooks`, {
    method: "POST",
    token: key,
    body: JSON.stringify({ url, eventTypes: [...DAILY_WEBHOOK_EVENTS] }),
  });
  return { id: hook.uuid, hmac: hook.hmac, url: hook.url };
}

export async function removeDailyWebhook(id: string) {
  if (!dailyConfigured()) return;
  await api(`${BASE}/webhooks/${id}`, { method: "DELETE", token: loadEnv().DAILY_API_KEY! }).catch(
    () => {},
  );
}

/** Daily signs `${timestamp}.${body}` with the base64-decoded hmac; signature is base64. */
export function verifyDailySignature(
  hmacB64: string,
  timestamp: string,
  signature: string,
  body: string,
) {
  const expected = createHmac("sha256", Buffer.from(hmacB64, "base64"))
    .update(`${timestamp}.${body}`)
    .digest("base64");
  if (expected.length !== signature.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

export const daily: ConferencingDriver = {
  async createMeeting(_token, spec) {
    if (!dailyConfigured()) throw new Error("Built-in video is not configured");
    const key = loadEnv().DAILY_API_KEY!;
    const body = dailyRoomBody(spec);
    const room = await api<{ name: string; url: string }>(`${BASE}/rooms`, {
      method: "POST",
      token: key,
      body: JSON.stringify(body),
    }).catch(async (e) => {
      // Room already exists (retry / reschedule of the same booking): reuse it.
      if (e?.status === 400 && /already exists/i.test(e.message))
        return api<{ name: string; url: string }>(`${BASE}/rooms/${body.name}`, { token: key });
      throw e;
    });
    return { url: meetPageUrl(room.name), ref: { room: room.name, dailyUrl: room.url } };
  },
  async deleteMeeting(_token, ref) {
    if (!dailyConfigured() || !ref.room) return;
    await api(`${BASE}/rooms/${ref.room}`, {
      method: "DELETE",
      token: loadEnv().DAILY_API_KEY!,
    }).catch((e) => {
      if (e?.status !== 404) throw e;
    });
  },
};
