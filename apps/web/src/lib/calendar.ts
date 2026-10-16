/*
 * Calendar maths for the bookings calendar, free of server imports so it is unit-tested on its
 * own. Dates are local calendar dates ("YYYY-MM-DD") in the viewer's timezone; weeks start on
 * Monday. Nothing here knows about bookings beyond a start, an end and an id.
 */
import { addDays, utcToZoned, weekdayOf, zonedToUtc } from "./time";

/** The bookings view a host last chose (list or calendar), read when the URL names none. */
export const BOOKINGS_VIEW_COOKIE = "bookly_bookings_view";

export type CalendarView = "day" | "week" | "month";
export const CALENDAR_VIEWS: CalendarView[] = ["day", "week", "month"];
export const isCalendarView = (v: unknown): v is CalendarView =>
  typeof v === "string" && (CALENDAR_VIEWS as string[]).includes(v);

export const isIsoDate = (v: unknown): v is string =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

/** Monday of the week that contains `date`. */
export function weekStart(date: string): string {
  return addDays(date, -((weekdayOf(date) + 6) % 7));
}

/** The seven dates of the week containing `date`, Monday first. */
export function weekDays(date: string): string[] {
  const start = weekStart(date);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/**
 * The month view's grid: whole weeks from the Monday on or before the 1st to the Sunday on or
 * after the last day, so every row has seven cells.
 */
export function monthGrid(date: string): string[][] {
  const first = `${date.slice(0, 7)}-01`;
  const [y, m] = first.split("-").map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const start = weekStart(first);
  const end = addDays(weekStart(last), 6);
  const weeks: string[][] = [];
  for (let d = start; d <= end; d = addDays(d, 7)) weeks.push(weekDays(d));
  return weeks;
}

/** The dates a view shows and the UTC instants that bound them (end exclusive). */
export function viewRange(view: CalendarView, date: string, tz: string) {
  const days = view === "day" ? [date] : view === "week" ? weekDays(date) : monthGrid(date).flat();
  const from = zonedToUtc(days[0]!, 0, tz);
  const to = zonedToUtc(addDays(days[days.length - 1]!, 1), 0, tz);
  return { days, from, to };
}

/** The date one step before or after `date` in this view. */
export function stepDate(view: CalendarView, date: string, dir: -1 | 1): string {
  if (view === "day") return addDays(date, dir);
  if (view === "week") return addDays(date, 7 * dir);
  const [y, m] = date.split("-").map(Number) as [number, number];
  const target = new Date(Date.UTC(y, m - 1 + dir, 1));
  return target.toISOString().slice(0, 10);
}

/** A human title for the range: "Friday, October 16, 2026", "Oct 12 – 18, 2026", "October 2026". */
export function viewTitle(view: CalendarView, date: string, locale = "en"): string {
  const at = (d: string) => new Date(`${d}T12:00:00Z`);
  if (view === "day")
    return at(date).toLocaleDateString(locale, {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
  if (view === "month")
    return at(date).toLocaleDateString(locale, {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
  const days = weekDays(date);
  // "Oct 12 – 18, 2026" / "Oct 26 – Nov 1, 2026": the platform's range formatter collapses
  // the shared parts; ICU separates with thin spaces, which read the same as spaces.
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  })
    .formatRange(at(days[0]!), at(days[6]!))
    .replace(/[\u2009\u202f]/g, " ");
}

export type Timed = { id: string; startAt: Date; endAt: Date };

/** Placement of a timed item inside one day column (minutes from local midnight). */
export type Placed<T extends Timed> = T & {
  date: string;
  startMin: number;
  endMin: number;
  /** Column among overlapping items, and how many columns that cluster has. */
  col: number;
  cols: number;
};

/**
 * Items for one local date, clipped to that day and laid out side by side where they overlap:
 * each cluster of overlapping items shares the width, the way calendar apps do it.
 */
export function layoutDay<T extends Timed>(items: T[], date: string, tz: string): Placed<T>[] {
  const day: Placed<T>[] = [];
  for (const it of items) {
    const s = utcToZoned(it.startAt, tz);
    const e = utcToZoned(it.endAt, tz);
    if (s.date > date || e.date < date || (e.date === date && e.minutes === 0 && s.date < date))
      continue;
    const startMin = s.date < date ? 0 : s.minutes;
    const endMin = e.date > date ? 24 * 60 : Math.max(e.minutes, startMin + 15);
    day.push({ ...it, date, startMin, endMin, col: 0, cols: 1 });
  }
  day.sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin || a.id.localeCompare(b.id));
  let cluster: Placed<T>[] = [];
  let clusterEnd = -1;
  const flush = () => {
    const cols = Math.max(1, ...cluster.map((p) => p.col + 1));
    for (const p of cluster) p.cols = cols;
    cluster = [];
  };
  for (const p of day) {
    if (p.startMin >= clusterEnd && cluster.length) flush();
    const used = new Set(cluster.filter((q) => q.endMin > p.startMin).map((q) => q.col));
    let col = 0;
    while (used.has(col)) col++;
    p.col = col;
    cluster.push(p);
    clusterEnd = Math.max(clusterEnd, p.endMin);
  }
  if (cluster.length) flush();
  return day;
}

/** The local date an item starts on, for the month view's day cells. */
export const startDate = (it: Timed, tz: string) => utcToZoned(it.startAt, tz).date;

/** The hours a day or week view shows: 7:00–20:00, widened to fit every item in it. */
export function visibleHours(placed: { startMin: number; endMin: number }[]): [number, number] {
  let from = 7;
  let to = 20;
  for (const p of placed) {
    from = Math.min(from, Math.floor(p.startMin / 60));
    to = Math.max(to, Math.ceil(p.endMin / 60));
  }
  return [Math.max(0, from), Math.min(24, to)];
}
