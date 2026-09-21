import type { IntegrationCalendar } from "@bookly/db/schema";
import { api, type CalendarDriver, type Interval, type MeetingSpec } from "./types";

const BASE = "https://graph.microsoft.com/v1.0";

export async function microsoftAccount(token: string) {
  const me = await api<{ mail?: string; userPrincipalName?: string; id?: string }>(`${BASE}/me`, {
    token,
  });
  return { label: me.mail ?? me.userPrincipalName ?? null, id: me.id ?? null };
}

/** Request body for POST /me/calendars/{id}/events — exported for tests. */
export function microsoftEventBody(spec: MeetingSpec, conference: boolean) {
  return {
    subject: spec.title,
    body: { contentType: "text", content: spec.description },
    start: { dateTime: spec.start.toISOString().replace("Z", ""), timeZone: "UTC" },
    end: { dateTime: spec.end.toISOString().replace("Z", ""), timeZone: "UTC" },
    location: spec.meetingUrl ? { displayName: spec.meetingUrl } : undefined,
    attendees: [
      {
        emailAddress: { address: spec.attendee.email, name: spec.attendee.name },
        type: "required",
      },
    ],
    ...(conference ? { isOnlineMeeting: true, onlineMeetingProvider: "teamsForBusiness" } : {}),
  };
}

/** PATCH body that replaces an event's attendee list — exported for tests. */
export function microsoftAttendeesBody(attendees: { name: string; email: string }[]) {
  return {
    attendees: attendees.map((a) => ({
      emailAddress: { address: a.email, name: a.name },
      type: "required",
    })),
  };
}

export const microsoft: CalendarDriver = {
  provider: "microsoft",
  async listCalendars(token) {
    const res = await api<{
      value?: { id: string; name: string; isDefaultCalendar?: boolean }[];
    }>(`${BASE}/me/calendars?$select=id,name,isDefaultCalendar&$top=50`, { token });
    return (res.value ?? []).map<IntegrationCalendar>((c) => ({
      id: c.id,
      name: c.name,
      primary: !!c.isDefaultCalendar,
    }));
  },
  async freeBusy(token, calendarIds, from, to) {
    if (!calendarIds.length) return [];
    // calendarView per calendar: getSchedule needs addresses, not calendar ids.
    const out: Interval[] = [];
    await Promise.all(
      calendarIds.map(async (id) => {
        const u = new URL(`${BASE}/me/calendars/${encodeURIComponent(id)}/calendarView`);
        u.searchParams.set("startDateTime", from.toISOString());
        u.searchParams.set("endDateTime", to.toISOString());
        u.searchParams.set("$select", "start,end,showAs,isCancelled");
        u.searchParams.set("$top", "250");
        const res = await api<{
          value?: {
            start: { dateTime: string };
            end: { dateTime: string };
            showAs?: string;
            isCancelled?: boolean;
          }[];
        }>(u.toString(), { token, headers: { Prefer: 'outlook.timezone="UTC"' } });
        for (const ev of res.value ?? []) {
          if (ev.isCancelled || ev.showAs === "free") continue;
          out.push({
            start: new Date(`${ev.start.dateTime}Z`),
            end: new Date(`${ev.end.dateTime}Z`),
          });
        }
      }),
    );
    return out;
  },
  async createEvent(token, calendarId, spec, { conference }) {
    const ev = await api<{
      id: string;
      webLink?: string;
      onlineMeeting?: { joinUrl?: string };
      onlineMeetingUrl?: string;
    }>(`${BASE}/me/calendars/${encodeURIComponent(calendarId)}/events`, {
      method: "POST",
      token,
      body: JSON.stringify(microsoftEventBody(spec, conference)),
    });
    return {
      id: ev.id,
      url: ev.webLink ?? null,
      meetingUrl: conference ? (ev.onlineMeeting?.joinUrl ?? ev.onlineMeetingUrl ?? null) : null,
    };
  },
  async deleteEvent(token, _calendarId, eventId) {
    await api(`${BASE}/me/events/${encodeURIComponent(eventId)}`, {
      method: "DELETE",
      token,
    }).catch((e) => {
      if (e?.status !== 404) throw e;
    });
  },
  async setAttendees(token, _calendarId, eventId, attendees) {
    await api(`${BASE}/me/events/${encodeURIComponent(eventId)}`, {
      method: "PATCH",
      token,
      body: JSON.stringify(microsoftAttendeesBody(attendees)),
    });
  },
};
