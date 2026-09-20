import type { IntegrationCalendar } from "@bookly/db/schema";
import { api, type CalendarDriver, type Interval, type MeetingSpec } from "./types";

const BASE = "https://www.googleapis.com/calendar/v3";

export async function googleAccount(token: string) {
  const me = await api<{ email?: string; sub?: string }>(
    "https://www.googleapis.com/oauth2/v3/userinfo",
    { token },
  );
  return { label: me.email ?? null, id: me.sub ?? null };
}

/** Request body for events.insert — exported for tests. */
export function googleEventBody(spec: MeetingSpec, conference: boolean) {
  return {
    summary: spec.title,
    description: spec.description,
    start: { dateTime: spec.start.toISOString(), timeZone: spec.timezone },
    end: { dateTime: spec.end.toISOString(), timeZone: spec.timezone },
    location: spec.meetingUrl ?? undefined,
    attendees: [{ email: spec.attendee.email, displayName: spec.attendee.name }],
    reminders: { useDefault: true },
    ...(conference
      ? {
          conferenceData: {
            createRequest: {
              requestId: `bookly-${spec.bookingId}`,
              conferenceSolutionKey: { type: "hangoutsMeet" },
            },
          },
        }
      : {}),
  };
}

export const google: CalendarDriver = {
  provider: "google",
  async listCalendars(token) {
    const res = await api<{
      items?: { id: string; summary: string; primary?: boolean; accessRole?: string }[];
    }>(`${BASE}/users/me/calendarList?minAccessRole=reader`, { token });
    return (res.items ?? []).map<IntegrationCalendar>((c) => ({
      id: c.id,
      name: c.summary,
      primary: !!c.primary,
    }));
  },
  async freeBusy(token, calendarIds, from, to) {
    if (!calendarIds.length) return [];
    const res = await api<{
      calendars?: Record<string, { busy?: { start: string; end: string }[] }>;
    }>(`${BASE}/freeBusy`, {
      method: "POST",
      token,
      body: JSON.stringify({
        timeMin: from.toISOString(),
        timeMax: to.toISOString(),
        items: calendarIds.map((id) => ({ id })),
      }),
    });
    const out: Interval[] = [];
    for (const c of Object.values(res.calendars ?? {}))
      for (const b of c.busy ?? []) out.push({ start: new Date(b.start), end: new Date(b.end) });
    return out;
  },
  async createEvent(token, calendarId, spec, { conference }) {
    const ev = await api<{
      id: string;
      htmlLink?: string;
      hangoutLink?: string;
      conferenceData?: { entryPoints?: { entryPointType: string; uri: string }[] };
    }>(
      `${BASE}/calendars/${encodeURIComponent(calendarId)}/events?conferenceDataVersion=1&sendUpdates=none`,
      { method: "POST", token, body: JSON.stringify(googleEventBody(spec, conference)) },
    );
    const meet =
      ev.hangoutLink ??
      ev.conferenceData?.entryPoints?.find((p) => p.entryPointType === "video")?.uri ??
      null;
    return { id: ev.id, url: ev.htmlLink ?? null, meetingUrl: conference ? meet : null };
  },
  async deleteEvent(token, calendarId, eventId) {
    await api(
      `${BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=none`,
      { method: "DELETE", token },
    ).catch((e) => {
      if (e?.status !== 404 && e?.status !== 410) throw e;
    });
  },
};
