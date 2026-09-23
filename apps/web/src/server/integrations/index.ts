import "server-only";
import { and, eq, schema } from "@bookly/db";
import type {
  Booking,
  EventType,
  Integration,
  IntegrationProvider,
  IntegrationSettings,
  LocationType,
} from "@bookly/db/schema";
import { sendEmail } from "@bookly/email";
import { decrypt, encrypt } from "@/lib/crypto";
import { db } from "@/lib/db";
import { daily, dailyConfigured } from "./daily";
import {
  cancelNotetaker,
  NOTETAKER_PROVIDERS,
  notetakerConfigured,
  notetakerRef,
  scheduleNotetaker,
  type NotetakerRef,
} from "./notetaker";
import { captureAllowed, hasFeature } from "@/server/limits";
import { google, googleAccount } from "./google";
import { microsoft, microsoftAccount } from "./microsoft";
import { exchangeCode, providerConfigured, refreshTokens } from "./oauth";
import type { CalendarDriver, Interval, MeetingSpec, OAuthTokens } from "./types";
import { ProviderError } from "./types";
import { ensureWatches, stopWatches } from "./watch";
import { zoom, zoomAccount } from "./zoom";

export { authorizeUrl, isProvider, providerConfigured, redirectUri } from "./oauth";
export { pushSupported, verifyNotification } from "./watch";
export {
  dailyConfigured,
  dailyRoomUrl,
  meetPageUrl,
  registerDailyWebhook,
  removeDailyWebhook,
  verifyDailySignature,
} from "./daily";

const CALENDARS: Record<"google" | "microsoft", CalendarDriver> = { google, microsoft };

/* ---------------- Connections ---------------- */

export async function listIntegrations(userId: string): Promise<Integration[]> {
  return db().query.integrations.findMany({ where: eq(schema.integrations.userId, userId) });
}

export async function getIntegration(userId: string, provider: IntegrationProvider) {
  return (
    (await db().query.integrations.findFirst({
      where: and(
        eq(schema.integrations.userId, userId),
        eq(schema.integrations.provider, provider),
      ),
    })) ?? null
  );
}

/** Finishes an OAuth round trip: stores tokens, loads the account label and calendars. */
export async function connectIntegration(
  workspaceId: string,
  userId: string,
  provider: IntegrationProvider,
  code: string,
) {
  const tokens = await exchangeCode(provider, code);
  const account =
    provider === "google"
      ? await googleAccount(tokens.accessToken)
      : provider === "microsoft"
        ? await microsoftAccount(tokens.accessToken)
        : await zoomAccount(tokens.accessToken);
  const calendars =
    provider === "zoom" ? [] : await CALENDARS[provider].listCalendars(tokens.accessToken);
  const primary = calendars.find((c) => c.primary) ?? calendars[0];
  const existing = await getIntegration(userId, provider);
  const settings: IntegrationSettings = existing?.settings ?? {
    conflictCalendarIds: primary ? [primary.id] : [],
    destinationCalendarId: primary?.id ?? null,
  };
  const values = {
    workspaceId,
    userId,
    provider,
    accountLabel: account.label,
    externalAccountId: account.id,
    scope: tokens.scope ?? null,
    accessToken: encrypt(tokens.accessToken),
    refreshToken: tokens.refreshToken
      ? encrypt(tokens.refreshToken)
      : (existing?.refreshToken ?? null),
    expiresAt: tokens.expiresAt ?? null,
    calendars,
    settings,
    status: "ok",
    lastError: null,
  };
  if (existing) {
    await db()
      .update(schema.integrations)
      .set(values)
      .where(eq(schema.integrations.id, existing.id));
  } else {
    await db().insert(schema.integrations).values(values);
  }
  const saved = await getIntegration(userId, provider);
  if (saved && provider !== "zoom")
    await ensureWatches(saved, tokens.accessToken).catch((e) =>
      console.error("[calendar] watch setup failed", e),
    );
}

export async function disconnectIntegration(userId: string, provider: IntegrationProvider) {
  const i = await getIntegration(userId, provider);
  if (i?.watch.length) {
    try {
      await stopWatches(i, await accessToken(i));
    } catch (e) {
      console.error("[calendar] stop watches failed", e);
    }
  }
  await db()
    .delete(schema.integrations)
    .where(and(eq(schema.integrations.userId, userId), eq(schema.integrations.provider, provider)));
}

export async function updateIntegrationSettings(
  userId: string,
  provider: IntegrationProvider,
  settings: IntegrationSettings,
) {
  await db()
    .update(schema.integrations)
    .set({ settings })
    .where(and(eq(schema.integrations.userId, userId), eq(schema.integrations.provider, provider)));
  const i = await getIntegration(userId, provider);
  if (i && provider !== "zoom") {
    try {
      await ensureWatches(i, await accessToken(i));
    } catch (e) {
      console.error("[calendar] watch update failed", e);
    }
  }
  invalidateBusy(userId);
}

/** Renews push channels that expire soon on every connected calendar (job / cron tick). */
export async function renewCalendarWatches(): Promise<number> {
  const rows = await db().query.integrations.findMany({
    where: eq(schema.integrations.status, "ok"),
  });
  let touched = 0;
  for (const i of rows) {
    if (i.provider === "zoom" || !(i.settings.conflictCalendarIds ?? []).length) continue;
    try {
      await ensureWatches(i, await accessToken(i));
      touched++;
    } catch (e) {
      await markError(i, e);
    }
  }
  return touched;
}

/** Re-reads the calendar list (after the user created a new calendar, say). */
export async function refreshCalendars(userId: string, provider: "google" | "microsoft") {
  const i = await getIntegration(userId, provider);
  if (!i) return;
  const token = await accessToken(i);
  const calendars = await CALENDARS[provider].listCalendars(token);
  await db()
    .update(schema.integrations)
    .set({ calendars, lastSyncedAt: new Date() })
    .where(eq(schema.integrations.id, i.id));
}

/* ---------------- Tokens ---------------- */

/** Valid access token, refreshing (and persisting) when it expires within a minute. */
async function accessToken(i: Integration): Promise<string> {
  const fresh = !i.expiresAt || i.expiresAt.getTime() - Date.now() > 60_000;
  if (fresh) return decrypt(i.accessToken);
  if (!i.refreshToken) throw new ProviderError(`${i.provider}: no refresh token`, 401, true);
  let t: OAuthTokens;
  try {
    t = await refreshTokens(i.provider, decrypt(i.refreshToken));
  } catch (e) {
    await markError(i, e);
    throw e;
  }
  await db()
    .update(schema.integrations)
    .set({
      accessToken: encrypt(t.accessToken),
      refreshToken: t.refreshToken ? encrypt(t.refreshToken) : i.refreshToken,
      expiresAt: t.expiresAt ?? null,
      status: "ok",
      lastError: null,
    })
    .where(eq(schema.integrations.id, i.id));
  return t.accessToken;
}

/** Records a provider failure; emails the host once when the connection first breaks. */
async function markError(i: Integration, e: unknown) {
  const message = e instanceof Error ? e.message : String(e);
  console.error(`[integrations] ${i.provider} failed for user ${i.userId}: ${message}`);
  const permanent = e instanceof ProviderError ? e.permanent : false;
  if (!permanent) return;
  await db()
    .update(schema.integrations)
    .set({ status: "error", lastError: message.slice(0, 500) })
    .where(eq(schema.integrations.id, i.id));
  if (i.status !== "error") {
    const u = await db().query.users.findFirst({
      where: eq(schema.users.id, i.userId),
      columns: { email: true },
    });
    if (u?.email) {
      const { loadEnv } = await import("@bookly/config");
      const name = providerName(i.provider);
      await sendEmail({
        to: u.email,
        subject: `Bookly: ${name} needs to be reconnected`,
        text: `Your ${name} connection stopped working (${message.slice(0, 200)}).\n\nBookings continue without it. Reconnect here: ${loadEnv().APP_URL}/admin/calendars`,
      }).catch(() => {});
    }
  }
}

export function providerName(p: IntegrationProvider | "daily") {
  return { google: "Google", microsoft: "Microsoft", zoom: "Zoom", daily: "Bookly video" }[p];
}

/* ---------------- Availability ---------------- */

const busyCache = new Map<string, { at: number; value: Interval[] }>();
const BUSY_TTL_MS = 60_000;

/** Busy intervals from every connected calendar the host selected for conflict checks. */
export async function externalBusy(userId: string, from: Date, to: Date): Promise<Interval[]> {
  const key = `${userId}:${from.toISOString()}:${to.toISOString()}`;
  const hit = busyCache.get(key);
  if (hit && Date.now() - hit.at < BUSY_TTL_MS) return hit.value;
  const conns = (await listIntegrations(userId)).filter(
    (i): i is Integration & { provider: "google" | "microsoft" } =>
      (i.provider === "google" || i.provider === "microsoft") && i.status !== "error",
  );
  const results = await Promise.all(
    conns.map(async (i) => {
      const ids = i.settings.conflictCalendarIds ?? [];
      if (!ids.length) return [];
      try {
        return await CALENDARS[i.provider].freeBusy(await accessToken(i), ids, from, to);
      } catch (e) {
        await markError(i, e); // fail open: the host stays bookable
        return [];
      }
    }),
  );
  const value = results.flat();
  busyCache.set(key, { at: Date.now(), value });
  return value;
}

export function invalidateBusy(userId: string) {
  for (const k of busyCache.keys()) if (k.startsWith(`${userId}:`)) busyCache.delete(k);
}

/* ---------------- Booking provisioning ---------------- */

/** Which conferencing options this host can actually use right now. */
export async function conferencingAvailability(userId: string) {
  const conns = await listIntegrations(userId);
  const has = (p: IntegrationProvider) =>
    conns.some((c) => c.provider === p && c.status !== "error");
  return {
    daily: dailyConfigured(),
    google_meet: has("google"),
    teams: has("microsoft"),
    zoom: has("zoom"),
    configured: {
      google: providerConfigured("google"),
      microsoft: providerConfigured("microsoft"),
      zoom: providerConfigured("zoom"),
    },
  } satisfies Record<string, unknown> & Partial<Record<LocationType, boolean>>;
}

type Provisioned = Pick<
  Booking,
  "meetingUrl" | "meetingProvider" | "meetingRef" | "externalEventIds" | "location"
>;

/**
 * Creates the meeting link and calendar events for a confirmed booking. Every step is
 * best-effort: a provider failure is logged and the booking proceeds without that piece.
 */
/** Books the notetaker for a Meet / Teams / Zoom call that should be transcribed. */
async function bookNotetaker(booking: Booking, meetingUrl: string): Promise<NotetakerRef | null> {
  const ws = await db().query.workspaces.findFirst({
    where: eq(schema.workspaces.id, booking.workspaceId),
  });
  if (!ws) return null;
  const allowed = await captureAllowed(ws);
  if (!allowed.ok) {
    console.warn(`[notetaker] not booked for ${booking.id}: ${allowed.reason}`);
    return null;
  }
  try {
    return await scheduleNotetaker({
      booking,
      meetingUrl,
      language: ws.settings.capture?.language,
      // Cut the bot at the remaining budget unless minutes past it are billed as overage.
      maxSeconds:
        allowed.left === null || allowed.overage ? 8 * 3600 : Math.max(60, allowed.left * 60),
    });
  } catch (e) {
    console.error("[notetaker] booking failed", e);
    return null;
  }
}

export async function provisionBooking(
  booking: Booking,
  eventType: EventType | null,
  host: { name: string; email: string | null },
): Promise<Provisioned> {
  const conns = await listIntegrations(booking.hostUserId);
  const byProvider = (p: IntegrationProvider) =>
    conns.find((c) => c.provider === p && c.status !== "error") ?? null;
  // Bookly video is a paid feature in cloud mode; a Free workspace's booking keeps its chosen
  // location without a room, or falls through to the event type's text.
  const owner = await db().query.workspaces.findFirst({
    where: eq(schema.workspaces.id, booking.workspaceId),
  });
  const videoAllowed = !owner || hasFeature(owner, "booklyVideo");
  const spec: MeetingSpec = {
    bookingId: booking.id,
    title: `${eventType?.title ?? "Meeting"}: ${host.name} and ${booking.attendeeName}`,
    description: [
      eventType?.description ?? "",
      booking.notes ? `Notes: ${booking.notes}` : "",
      ...Object.entries(booking.answers).map(([k, v]) => `${k}: ${v}`),
      `Booked via Bookly.`,
    ]
      .filter(Boolean)
      .join("\n"),
    start: booking.startAt,
    end: booking.endAt,
    timezone: booking.timezone,
    host,
    attendee: { name: booking.attendeeName, email: booking.attendeeEmail },
    meetingUrl: null,
    transcription:
      !!eventType &&
      (eventType.autoCapture === "always" ||
        (eventType.autoCapture === "ask" && booking.captureConsent === true)),
  };

  let location = booking.location;
  let meetingUrl: string | null = null;
  let meetingProvider: string | null = null;
  let meetingRef: Record<string, unknown> | null = null;
  const externalEventIds: Record<string, string> = { ...booking.externalEventIds };

  // 1. Conferencing. Meet/Teams come from the calendar event itself.
  const want = location.type;
  const tryConference = async (type: LocationType) => {
    if (type === "zoom") {
      const c = byProvider("zoom");
      if (!c) return false;
      const m = await zoom.createMeeting(await accessToken(c), spec);
      meetingUrl = m.url;
      meetingProvider = "zoom";
      meetingRef = m.ref;
      return true;
    }
    if (type === "daily") {
      if (!dailyConfigured() || !videoAllowed) return false;
      const m = await daily.createMeeting(null, spec);
      meetingUrl = m.url;
      meetingProvider = "daily";
      meetingRef = m.ref;
      return true;
    }
    if (type === "google_meet" || type === "teams") {
      const p = type === "google_meet" ? "google" : "microsoft";
      const c = byProvider(p);
      const calId = c?.settings.destinationCalendarId ?? c?.calendars.find((x) => x.primary)?.id;
      if (!c || !calId) return false;
      const ev = await CALENDARS[p].createEvent(await accessToken(c), calId, spec, {
        conference: true,
      });
      if (!ev.meetingUrl) return false;
      meetingUrl = ev.meetingUrl;
      meetingProvider = type;
      meetingRef = { calendarId: calId, eventId: ev.id };
      externalEventIds[p] = `${calId}|${ev.id}`;
      return true;
    }
    return false;
  };

  const order: LocationType[] = want === "daily" ? ["daily"] : [want, "daily"];
  for (const type of order) {
    if (!["zoom", "daily", "google_meet", "teams"].includes(type)) break;
    try {
      if (await tryConference(type)) {
        if (type !== want) location = { type };
        break;
      }
    } catch (e) {
      const c =
        type === "zoom"
          ? byProvider("zoom")
          : type === "google_meet"
            ? byProvider("google")
            : type === "teams"
              ? byProvider("microsoft")
              : null;
      if (c) await markError(c, e);
      else console.error("[integrations] conferencing failed", e);
    }
  }
  spec.meetingUrl = meetingUrl;

  // 1b. Auto-capture on an external provider: the notetaker joins the call.
  if (
    spec.transcription &&
    meetingUrl &&
    meetingProvider &&
    NOTETAKER_PROVIDERS.has(meetingProvider) &&
    notetakerConfigured()
  ) {
    const nt = await bookNotetaker(booking, meetingUrl);
    if (nt) meetingRef = { ...(meetingRef ?? {}), notetaker: nt };
  }

  // 2. Calendar sync into every connected calendar that does not already hold the event.
  for (const c of conns) {
    if (c.provider === "zoom" || c.status === "error" || externalEventIds[c.provider]) continue;
    const calId = c.settings.destinationCalendarId ?? c.calendars.find((x) => x.primary)?.id;
    if (!calId) continue;
    try {
      const ev = await CALENDARS[c.provider].createEvent(await accessToken(c), calId, spec, {
        conference: false,
      });
      externalEventIds[c.provider] = `${calId}|${ev.id}`;
    } catch (e) {
      await markError(c, e);
    }
  }
  invalidateBusy(booking.hostUserId);
  return { meetingUrl, meetingProvider, meetingRef, externalEventIds, location };
}

/** Removes calendar events and the meeting for a cancelled/rescheduled booking (best-effort). */
/** Rewrites the guest list on the calendar event(s) a group session's owner booking holds. */
export async function syncEventAttendees(
  owner: Booking,
  attendees: { name: string; email: string }[],
): Promise<void> {
  const conns = await listIntegrations(owner.hostUserId);
  for (const [provider, ref] of Object.entries(owner.externalEventIds)) {
    const c = conns.find((x) => x.provider === provider);
    if (!c || (provider !== "google" && provider !== "microsoft")) continue;
    const [calId, eventId] = ref.split("|");
    if (!calId || !eventId) continue;
    try {
      await CALENDARS[provider].setAttendees(await accessToken(c), calId, eventId, attendees);
    } catch (e) {
      await markError(c, e);
    }
  }
}

export async function deprovisionBooking(booking: Booking): Promise<void> {
  const conns = await listIntegrations(booking.hostUserId);
  for (const [provider, ref] of Object.entries(booking.externalEventIds)) {
    const c = conns.find((x) => x.provider === provider);
    if (!c || (provider !== "google" && provider !== "microsoft")) continue;
    const [calId, eventId] = ref.split("|");
    if (!calId || !eventId) continue;
    try {
      await CALENDARS[provider].deleteEvent(await accessToken(c), calId, eventId);
    } catch (e) {
      await markError(c, e);
    }
  }
  const nt = notetakerRef(booking);
  if (nt) await cancelNotetaker(nt).catch((e) => console.error("[notetaker] cancel failed", e));
  try {
    if (booking.meetingProvider === "zoom" && booking.meetingRef) {
      const c = conns.find((x) => x.provider === "zoom");
      if (c) await zoom.deleteMeeting(await accessToken(c), booking.meetingRef);
    } else if (booking.meetingProvider === "daily" && booking.meetingRef) {
      await daily.deleteMeeting(null, booking.meetingRef);
    }
  } catch (e) {
    console.error("[integrations] meeting cleanup failed", e);
  }
  invalidateBusy(booking.hostUserId);
}
