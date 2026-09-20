import type { Integration, IntegrationCalendar, IntegrationProvider } from "@bookly/db/schema";

export type Interval = { start: Date; end: Date };

/** What a calendar/conferencing driver needs to create an event or meeting. */
export type MeetingSpec = {
  /** Stable id used for room names / idempotency. */
  bookingId: string;
  title: string;
  description: string;
  start: Date;
  end: Date;
  timezone: string;
  host: { name: string; email: string | null };
  attendee: { name: string; email: string };
  /** Existing meeting link to put in the calendar event's location, if any. */
  meetingUrl?: string | null;
};

export type CreatedEvent = { id: string; url?: string | null; meetingUrl?: string | null };
export type CreatedMeeting = { url: string; ref: Record<string, unknown> };

export type OAuthTokens = {
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: Date | null;
  scope?: string | null;
};

/** Calendar providers (Google, Microsoft) also create conference links when asked. */
export interface CalendarDriver {
  provider: IntegrationProvider;
  listCalendars(token: string): Promise<IntegrationCalendar[]>;
  freeBusy(token: string, calendarIds: string[], from: Date, to: Date): Promise<Interval[]>;
  createEvent(
    token: string,
    calendarId: string,
    spec: MeetingSpec,
    opts: { conference: boolean },
  ): Promise<CreatedEvent>;
  deleteEvent(token: string, calendarId: string, eventId: string): Promise<void>;
}

export interface ConferencingDriver {
  createMeeting(token: string | null, spec: MeetingSpec): Promise<CreatedMeeting>;
  deleteMeeting(token: string | null, ref: Record<string, unknown>): Promise<void>;
}

export type ConnectedIntegration = Integration & { token: string };

export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly permanent = false,
  ) {
    super(message);
  }
}

/** fetch wrapper that raises ProviderError with the response body for diagnostics. */
export async function api<T>(url: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.token) headers.set("authorization", `Bearer ${init.token}`);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  const res = await fetch(url, { ...init, headers });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!res.ok) {
    throw new ProviderError(
      `${init.method ?? "GET"} ${url} → ${res.status}: ${text.slice(0, 300)}`,
      res.status,
      res.status === 401 || res.status === 403,
    );
  }
  return (text ? JSON.parse(text) : undefined) as T;
}
