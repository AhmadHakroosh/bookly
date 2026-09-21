/**
 * Pure helpers for recurring bookings. Occurrences are computed on the attendee's wall clock so
 * a weekly 10:00 stays at 10:00 across daylight-saving changes.
 */
import type { Recurrence } from "@bookly/db/schema";
import { utcToZoned, zonedToUtc } from "@/lib/time";

export const MAX_OCCURRENCES = 52;

export type NormalizedRecurrence = {
  freq: "daily" | "weekly" | "monthly";
  interval: number;
  count: number;
};

/** The effective rule, or null when the event type does not repeat. */
export function recurrenceOf(r: Recurrence | null | undefined): NormalizedRecurrence | null {
  if (!r?.enabled) return null;
  const count = Math.min(MAX_OCCURRENCES, Math.max(2, Math.floor(r.count ?? 0)));
  const interval = Math.min(12, Math.max(1, Math.floor(r.interval ?? 1)));
  const freq = r.freq === "daily" || r.freq === "monthly" ? r.freq : "weekly";
  return { freq, interval, count };
}

export function describeRecurrence(r: NormalizedRecurrence): string {
  const unit = r.freq === "daily" ? "day" : r.freq === "weekly" ? "week" : "month";
  const every = r.interval === 1 ? `Every ${unit}` : `Every ${r.interval} ${unit}s`;
  return `${every}, ${r.count} times`;
}

function shiftDate(date: string, freq: NormalizedRecurrence["freq"], steps: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  if (freq === "monthly") {
    // Same day-of-month; clamp when the target month is shorter (Jan 31 → Feb 28).
    const total = y * 12 + (m - 1) + steps;
    const ty = Math.floor(total / 12);
    const tm = (total % 12) + 1;
    const last = new Date(Date.UTC(ty, tm, 0)).getUTCDate();
    return `${ty}-${String(tm).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
  }
  const days = freq === "daily" ? steps : steps * 7;
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

/** All occurrence starts of a series (UTC instants), the first being `start` itself. */
export function occurrences(start: Date, tz: string, r: NormalizedRecurrence): Date[] {
  const { date, minutes } = utcToZoned(start, tz);
  const out: Date[] = [start];
  for (let k = 1; k < r.count; k++) {
    out.push(zonedToUtc(shiftDate(date, r.freq, k * r.interval), minutes, tz));
  }
  return out;
}
