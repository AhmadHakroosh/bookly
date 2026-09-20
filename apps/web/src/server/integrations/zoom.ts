import { api, type ConferencingDriver, type MeetingSpec } from "./types";

const BASE = "https://api.zoom.us/v2";

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
