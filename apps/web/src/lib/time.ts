import { TZDate } from "@date-fns/tz";

/** Minutes from midnight → "HH:MM". */
export const minToHHMM = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
/** "HH:MM" → minutes from midnight. */
export const hhmmToMin = (s: string) => {
  const [h, m] = s.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/** Instant for a local wall-clock time in `tz` (DST-safe). */
export function zonedToUtc(date: string, minutes: number, tz: string): Date {
  const [y, mo, d] = date.split("-").map(Number);
  const z = new TZDate(y!, mo! - 1, d!, Math.floor(minutes / 60), minutes % 60, 0, tz);
  return new Date(z.getTime());
}

/** Local calendar date and minutes-from-midnight of an instant in `tz`. */
export function utcToZoned(
  instant: Date,
  tz: string,
): { date: string; minutes: number; weekday: number } {
  const z = new TZDate(instant.getTime(), tz);
  const date = `${z.getFullYear()}-${String(z.getMonth() + 1).padStart(2, "0")}-${String(z.getDate()).padStart(2, "0")}`;
  return { date, minutes: z.getHours() * 60 + z.getMinutes(), weekday: z.getDay() };
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d! + n));
  return dt.toISOString().slice(0, 10);
}

export function weekdayOf(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay();
}

export function todayIn(tz: string, now = new Date()): string {
  return utcToZoned(now, tz).date;
}

export function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function formatInTz(
  instant: Date,
  tz: string,
  opts: Intl.DateTimeFormatOptions = {},
  locale = "en",
) {
  return new Intl.DateTimeFormat(locale, { timeZone: tz, ...opts }).format(instant);
}

export const fmtDateTime = (instant: Date, tz: string, locale = "en") =>
  formatInTz(
    instant,
    tz,
    {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    },
    locale,
  );
export const fmtTime = (instant: Date, tz: string, locale = "en") =>
  formatInTz(instant, tz, { hour: "numeric", minute: "2-digit" }, locale);
export const fmtDate = (instant: Date, tz: string, locale = "en") =>
  formatInTz(
    instant,
    tz,
    { weekday: "long", year: "numeric", month: "long", day: "numeric" },
    locale,
  );

/** Common IANA zones for pickers; the full list comes from Intl when available. */
export function timezoneList(): string[] {
  try {
    const zones = (
      Intl as unknown as { supportedValuesOf: (k: string) => string[] }
    ).supportedValuesOf("timeZone");
    return zones.includes("UTC") ? zones : ["UTC", ...zones];
  } catch {
    return [
      "UTC",
      "Europe/London",
      "Europe/Berlin",
      "Asia/Jerusalem",
      "America/New_York",
      "America/Los_Angeles",
      "Asia/Tokyo",
    ];
  }
}
