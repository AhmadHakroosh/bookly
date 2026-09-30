import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import ICAL from "ical.js";
import { and, eq, lt, or, isNull, schema } from "@bookly/db";
import type { CalendarFeed, FeedBusy } from "@bookly/db/schema";
import { db } from "@/lib/db";
import { decrypt, encrypt } from "@/lib/crypto";
import { isValidTimezone, zonedToUtc } from "@/lib/time";
import type { Interval } from "./types";

/*
 * Calendar feeds: read-only ICS subscriptions by URL. A feed is fetched on a schedule and its
 * busy blocks kept on the row, so availability never waits on a remote calendar.
 */

export const MAX_FEEDS_PER_USER = 5;
/** How far a sync looks: a week back (running events) and past the longest booking window. */
const LOOKBACK_DAYS = 7;
const LOOKAHEAD_DAYS = 400;
const MAX_BYTES = 5 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 3;
/** Guards against a feed that expands into millions of occurrences. */
const MAX_OCCURRENCES = 50_000;

/* ---------------- URL safety ---------------- */

/** Private, loopback, link-local and metadata ranges: a feed URL must not reach them. */
export function isPrivateAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split(".").map(Number) as [number, number];
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      a >= 224
    );
  }
  if (v === 6) {
    const s = ip.toLowerCase();
    if (s === "::" || s === "::1") return true;
    if (s.startsWith("fc") || s.startsWith("fd") || s.startsWith("fe8") || s.startsWith("fe9"))
      return true;
    if (s.startsWith("fea") || s.startsWith("feb") || s.startsWith("ff")) return true;
    const mapped = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]!);
    return false;
  }
  return true;
}

/**
 * Normalises a feed address (`webcal://` becomes `https://`) and refuses anything that is not
 * a public http(s) host: no credentials in the URL, no localhost, no private ranges once the
 * name resolves. Returns the URL to fetch.
 */
export async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw.trim().replace(/^webcals?:\/\//i, "https://"));
  } catch {
    throw new Error("That is not a valid URL.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:")
    throw new Error("The feed address must start with https://, http:// or webcal://.");
  if (url.username || url.password)
    throw new Error("The feed address must not contain a password.");
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local"))
    throw new Error("The feed address must be a public host.");
  const literal = host.replace(/^\[|\]$/g, "");
  if (isIP(literal)) {
    if (isPrivateAddress(literal)) throw new Error("The feed address must be a public host.");
    return url;
  }
  const addrs = await lookup(host, { all: true }).catch(() => []);
  if (!addrs.length) throw new Error(`Could not resolve ${host}.`);
  if (addrs.some((a) => isPrivateAddress(a.address)))
    throw new Error("The feed address must be a public host.");
  return url;
}

/** Fetches a feed with a size cap, a timeout and re-checked redirects. Returns the ICS text. */
export async function fetchFeed(raw: string): Promise<string> {
  let url = await assertPublicUrl(raw);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        accept: "text/calendar, text/plain;q=0.8, */*;q=0.5",
        "user-agent": "Bookly calendar feeds",
      },
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) throw new Error("The feed redirected without a destination.");
      url = await assertPublicUrl(new URL(loc, url).toString());
      continue;
    }
    if (!res.ok) throw new Error(`The feed answered ${res.status}.`);
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len > MAX_BYTES) throw new Error("The feed is larger than 5 MB.");
    const reader = res.body?.getReader();
    if (!reader) throw new Error("The feed was empty.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel();
        throw new Error("The feed is larger than 5 MB.");
      }
      chunks.push(value);
    }
    const text = new TextDecoder().decode(Buffer.concat(chunks));
    if (!/BEGIN:VCALENDAR/i.test(text))
      throw new Error("That address did not return a calendar (no VCALENDAR found).");
    return text;
  }
  throw new Error("The feed redirected too many times.");
}

/* ---------------- Parsing ---------------- */

const ymd = (t: ICAL.Time) =>
  `${t.year}-${String(t.month).padStart(2, "0")}-${String(t.day).padStart(2, "0")}`;

/**
 * An ICAL time as an instant. Zones defined in the feed (VTIMEZONE) are used as they are;
 * a TZID the feed does not define falls back to the IANA zone of that name; all-day values
 * are midnight in that zone, or UTC when the feed gives none.
 */
export function toInstant(t: ICAL.Time, tzidParam: string | undefined): Date {
  const fallback = tzidParam && isValidTimezone(tzidParam) ? tzidParam : undefined;
  if (t.isDate) return zonedToUtc(ymd(t), 0, fallback ?? "UTC");
  const zoneId = t.zone?.tzid;
  if (zoneId === "UTC" || zoneId === "Z") return t.toJSDate();
  if (zoneId && zoneId !== "floating" && ICAL.TimezoneService.has(zoneId)) return t.toJSDate();
  if (fallback) return zonedToUtc(ymd(t), t.hour * 60 + t.minute, fallback);
  return t.toJSDate();
}

/** `X-WR-CALNAME`, the display name most feeds carry. */
export function feedName(text: string): string | null {
  const comp = new ICAL.Component(ICAL.parse(text));
  const name = comp.getFirstPropertyValue("x-wr-calname");
  return typeof name === "string" && name.trim() ? name.trim().slice(0, 80) : null;
}

/** Coalesces overlapping or touching intervals into as few as possible. */
export function mergeIntervals(list: Interval[]): Interval[] {
  const sorted = [...list].sort((a, b) => a.start.getTime() - b.start.getTime());
  const out: Interval[] = [];
  for (const cur of sorted) {
    const last = out[out.length - 1];
    if (last && cur.start.getTime() <= last.end.getTime()) {
      if (cur.end > last.end) last.end = cur.end;
    } else out.push({ start: new Date(cur.start), end: new Date(cur.end) });
  }
  return out;
}

const isBusy = (comp: ICAL.Component) => {
  const transp = String(comp.getFirstPropertyValue("transp") ?? "").toUpperCase();
  if (transp === "TRANSPARENT") return false;
  const status = String(comp.getFirstPropertyValue("status") ?? "").toUpperCase();
  if (status === "CANCELLED") return false;
  const ms = String(comp.getFirstPropertyValue("x-microsoft-cdo-busystatus") ?? "").toUpperCase();
  if (ms === "FREE") return false;
  return true;
};

/**
 * Busy intervals in `[from, to]` from an ICS document: every opaque, non-cancelled event,
 * recurrences expanded with their exceptions, merged.
 */
export function parseBusy(
  text: string,
  from: Date,
  to: Date,
): { busy: Interval[]; events: number } {
  const comp = new ICAL.Component(ICAL.parse(text));
  for (const vtz of comp.getAllSubcomponents("vtimezone")) {
    const tzid = vtz.getFirstPropertyValue("tzid");
    if (typeof tzid === "string" && !ICAL.TimezoneService.has(tzid))
      ICAL.TimezoneService.register(vtz);
  }
  const mains = new Map<string, ICAL.Event>();
  const exceptions: ICAL.Event[] = [];
  let events = 0;
  for (const ve of comp.getAllSubcomponents("vevent")) {
    const ev = new ICAL.Event(ve);
    events++;
    if (ev.isRecurrenceException()) exceptions.push(ev);
    else mains.set(ev.uid || `anon-${events}`, ev);
  }
  for (const ex of exceptions) {
    const main = mains.get(ex.uid);
    if (main) main.relateException(ex);
    else mains.set(`${ex.uid}#${exceptions.indexOf(ex)}`, ex);
  }
  const fromT = ICAL.Time.fromJSDate(new Date(from.getTime() - 31 * 86_400_000), true);
  const toT = ICAL.Time.fromJSDate(to, true);
  const busy: Interval[] = [];
  let occurrences = 0;
  for (const ev of mains.values()) {
    const tzid =
      (ev.component.getFirstProperty("dtstart")?.getParameter("tzid") as string | undefined) ||
      undefined;
    const push = (item: ICAL.Event, s: ICAL.Time, e: ICAL.Time) => {
      if (!isBusy(item.component)) return;
      const start = toInstant(s, tzid);
      const end = toInstant(e, tzid);
      if (end <= start || end <= from || start >= to) return;
      busy.push({ start, end });
    };
    if (!ev.isRecurring()) {
      push(ev, ev.startDate, ev.endDate);
      continue;
    }
    // `iterator(start)` would replace the rule's DTSTART, so iterate from the event's own start
    // and skip what ends before the window; the occurrence cap bounds a rule that never ends.
    const it = ev.iterator();
    let next: ICAL.Time | null | undefined;
    while ((next = it.next()) && next.compare(toT) <= 0) {
      if (++occurrences > MAX_OCCURRENCES) break;
      if (next.compare(fromT) < 0) continue;
      const occ = ev.getOccurrenceDetails(next);
      push(occ.item, occ.startDate, occ.endDate);
    }
    if (occurrences > MAX_OCCURRENCES) break;
  }
  return { busy: mergeIntervals(busy), events };
}

/* ---------------- Storage and sync ---------------- */

const toRows = (list: Interval[]): FeedBusy[] =>
  list.map((i) => ({ s: i.start.toISOString(), e: i.end.toISOString() }));

export async function listFeeds(userId: string): Promise<CalendarFeed[]> {
  return db().query.calendarFeeds.findMany({
    where: eq(schema.calendarFeeds.userId, userId),
    orderBy: (f, { asc }) => [asc(f.createdAt)],
  });
}

/** Fetches, parses and stores one feed. Errors are recorded on the row; the last good busy list stays. */
export async function syncFeed(feed: CalendarFeed): Promise<CalendarFeed> {
  const now = Date.now();
  const from = new Date(now - LOOKBACK_DAYS * 86_400_000);
  const to = new Date(now + LOOKAHEAD_DAYS * 86_400_000);
  try {
    const text = await fetchFeed(decrypt(feed.url));
    const { busy, events } = parseBusy(text, from, to);
    const [row] = await db()
      .update(schema.calendarFeeds)
      .set({
        busy: toRows(busy),
        eventCount: events,
        status: "ok",
        lastError: null,
        lastSyncedAt: new Date(),
      })
      .where(eq(schema.calendarFeeds.id, feed.id))
      .returning();
    return row!;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const [row] = await db()
      .update(schema.calendarFeeds)
      .set({ status: "error", lastError: message.slice(0, 500), lastSyncedAt: new Date() })
      .where(eq(schema.calendarFeeds.id, feed.id))
      .returning();
    return row!;
  }
}

/** The scheduled pass: every feed not synced in the last `staleMinutes`. Returns how many ran. */
export async function syncStaleFeeds(staleMinutes = 10): Promise<number> {
  const cutoff = new Date(Date.now() - staleMinutes * 60_000);
  const stale = await db().query.calendarFeeds.findMany({
    where: or(
      isNull(schema.calendarFeeds.lastSyncedAt),
      lt(schema.calendarFeeds.lastSyncedAt, cutoff),
    ),
  });
  for (const f of stale) await syncFeed(f);
  return stale.length;
}

/** Validates the address, fetches it once, and stores the feed with its first busy list. */
export async function addFeed(
  workspaceId: string,
  userId: string,
  rawUrl: string,
  label: string | null,
): Promise<CalendarFeed> {
  const existing = await listFeeds(userId);
  if (existing.length >= MAX_FEEDS_PER_USER)
    throw new Error(`You can subscribe to up to ${MAX_FEEDS_PER_USER} calendar feeds.`);
  const url = await assertPublicUrl(rawUrl);
  if (existing.some((f) => decrypt(f.url) === url.toString()))
    throw new Error("That feed is already subscribed.");
  const text = await fetchFeed(url.toString());
  const now = Date.now();
  const { busy, events } = parseBusy(
    text,
    new Date(now - LOOKBACK_DAYS * 86_400_000),
    new Date(now + LOOKAHEAD_DAYS * 86_400_000),
  );
  const name = label?.trim().slice(0, 80) || feedName(text) || url.hostname;
  const [row] = await db()
    .insert(schema.calendarFeeds)
    .values({
      workspaceId,
      userId,
      label: name,
      url: encrypt(url.toString()),
      busy: toRows(busy),
      eventCount: events,
      status: "ok",
      lastSyncedAt: new Date(),
    })
    .returning();
  return row!;
}

export async function removeFeed(userId: string, id: string): Promise<void> {
  await db()
    .delete(schema.calendarFeeds)
    .where(and(eq(schema.calendarFeeds.id, id), eq(schema.calendarFeeds.userId, userId)));
}

/** Busy intervals from the host's feeds that overlap `[from, to]`, from the stored blocks. */
export async function feedBusy(userId: string, from: Date, to: Date): Promise<Interval[]> {
  const feeds = await listFeeds(userId);
  const out: Interval[] = [];
  for (const f of feeds)
    for (const b of f.busy) {
      const start = new Date(b.s);
      const end = new Date(b.e);
      if (end > from && start < to) out.push({ start, end });
    }
  return out;
}
