import { createHmac, timingSafeEqual } from "node:crypto";
import { api, type ConferencingDriver, type MeetingSpec } from "./types";

const BASE = "https://api.zoom.us/v2";

/* ---------------- event notifications (deauthorization) ---------------- */

const hmacHex = (secret: string, message: string) =>
  createHmac("sha256", secret).update(message).digest("hex");

/**
 * Zoom signs every event notification: `x-zm-signature` is `v0=` + HMAC-SHA256 of
 * `v0:<x-zm-request-timestamp>:<body>` with the app's Secret Token. Requests older than five
 * minutes are refused.
 */
export function verifyZoomSignature(
  secret: string,
  headers: { timestamp: string | null; signature: string | null },
  body: string,
  now = Date.now(),
): boolean {
  if (!headers.timestamp || !headers.signature) return false;
  const ts = Number(headers.timestamp);
  if (!Number.isFinite(ts) || Math.abs(now / 1000 - ts) > 300) return false;
  const expected = `v0=${hmacHex(secret, `v0:${headers.timestamp}:${body}`)}`;
  const a = Buffer.from(expected);
  const b = Buffer.from(headers.signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Zoom validates a new endpoint by sending a plainToken; the answer is its HMAC with the secret. */
export function zoomChallenge(secret: string, plainToken: string) {
  return { plainToken, encryptedToken: hmacHex(secret, plainToken) };
}

export async function zoomAccount(token: string) {
  const me = await api<{ email?: string; id?: string }>(`${BASE}/users/me`, { token });
  return { label: me.email ?? null, id: me.id ?? null };
}

/** Request body for POST /users/me/meetings — exported for tests. */
export function zoomMeetingBody(spec: MeetingSpec) {
  return {
    topic: spec.title.slice(0, 200),
    type: 2, // scheduled
    start_time: spec.start.toISOString(),
    duration: Math.max(1, Math.round((spec.end.getTime() - spec.start.getTime()) / 60000)),
    timezone: spec.timezone,
    agenda: spec.description.slice(0, 2000),
    settings: { join_before_host: true, waiting_room: false, approval_type: 2 },
  };
}

export const zoom: ConferencingDriver = {
  async createMeeting(token, spec) {
    if (!token) throw new Error("Zoom is not connected");
    const m = await api<{ id: number; join_url: string; password?: string }>(
      `${BASE}/users/me/meetings`,
      { method: "POST", token, body: JSON.stringify(zoomMeetingBody(spec)) },
    );
    return { url: m.join_url, ref: { id: m.id } };
  },
  async deleteMeeting(token, ref) {
    if (!token || !ref.id) return;
    await api(`${BASE}/meetings/${ref.id}`, { method: "DELETE", token }).catch((e) => {
      if (e?.status !== 404) throw e;
    });
  },
};
