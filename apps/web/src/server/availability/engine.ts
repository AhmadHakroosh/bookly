/**
 * Pure availability engine. No database, no I/O — everything is passed in.
 *
 *   slots = (weekly rules ∪ overrides, in the schedule tz)
 *           − existing bookings (with buffers)
 *           − external busy intervals
 *           − min notice / max days ahead
 *           → grouped by the attendee's calendar day
 */
import { addDays, utcToZoned, weekdayOf, zonedToUtc } from "@/lib/time";

export type Rule = { weekday: number; startMin: number; endMin: number };
export type Override = { date: string; startMin: number | null; endMin: number | null };
export type Interval = { start: Date; end: Date };
/** A group session already on the calendar: how many seats of this event type are taken at `start`. */
export type Occupied = Interval & { count: number };

export type EngineInput = {
  scheduleTz: string;
  rules: Rule[];
  overrides: Override[];
  durationMin: number;
  slotIntervalMin?: number | null;
  bufferBeforeMin?: number;
  bufferAfterMin?: number;
  minNoticeMin?: number;
  maxDaysAhead?: number;
  maxPerDay?: number | null;
  /** Existing bookings of the host (UTC instants). Buffers are applied around these. */
  busy: Interval[];
  /** Attendees per slot (default 1). With more, `occupied` sessions stay bookable until full. */
  seats?: number;
  /** Sessions of this same event type (excluded from `busy`), with their seat counts. */
  occupied?: Occupied[];
  /** Attendee timezone for grouping the output. */
  attendeeTz: string;
  /** Inclusive date range in the attendee tz. */
  from: string;
  to: string;
  now?: Date;
};

export type DaySlots = { date: string; slots: Date[] };
/** Per-slot seat availability, only meaningful for group event types. */
export type SeatMap = Map<number, number>;

const overlaps = (a: Interval, b: Interval) => a.start < b.end && b.start < a.end;

/** Available windows (UTC) for one schedule-tz calendar date, honoring overrides. */
export function windowsForDate(
  date: string,
  rules: Rule[],
  overrides: Override[],
  tz: string,
): Interval[] {
  const ov = overrides.filter((o) => o.date === date);
  let ranges: { startMin: number; endMin: number }[];
  if (ov.length) {
    ranges = ov
      .filter((o) => o.startMin !== null && o.endMin !== null)
      .map((o) => ({ startMin: o.startMin!, endMin: o.endMin! }));
  } else {
    const wd = weekdayOf(date);
    ranges = rules
      .filter((r) => r.weekday === wd)
      .map((r) => ({ startMin: r.startMin, endMin: r.endMin }));
  }
  return ranges
    .filter((r) => r.endMin > r.startMin)
    .map((r) => ({ start: zonedToUtc(date, r.startMin, tz), end: zonedToUtc(date, r.endMin, tz) }));
}

export function computeSlots(input: EngineInput): DaySlots[] {
  const now = input.now ?? new Date();
  const step = Math.max(5, input.slotIntervalMin ?? input.durationMin);
  const durMs = input.durationMin * 60_000;
  const before = (input.bufferBeforeMin ?? 0) * 60_000;
  const after = (input.bufferAfterMin ?? 0) * 60_000;
  const earliest = new Date(now.getTime() + (input.minNoticeMin ?? 0) * 60_000);
  const latest = new Date(now.getTime() + (input.maxDaysAhead ?? 60) * 86_400_000);
  // Buffers belong to the candidate slot ([start - before, end + after]); busy intervals are used as-is.
  const busy = input.busy;
  const seats = Math.max(1, input.seats ?? 1);
  const occupied = input.occupied ?? [];

  // Attendee-day range → schedule-tz dates that could contribute (±1 day for tz skew).
  const dates = new Set<string>();
  for (let d = addDays(input.from, -1); d <= addDays(input.to, 1); d = addDays(d, 1)) dates.add(d);

  const byDay = new Map<string, Date[]>();
  for (const date of dates) {
    for (const w of windowsForDate(date, input.rules, input.overrides, input.scheduleTz)) {
      for (let t = w.start.getTime(); t + durMs <= w.end.getTime(); t += step * 60_000) {
        const start = new Date(t);
        const end = new Date(t + durMs);
        if (start < earliest || start > latest) continue;
        const padded = { start: new Date(t - before), end: new Date(t + durMs + after) };
        if (busy.some((b) => overlaps(padded, b))) continue;
        // Group events: a session at this exact start stays open until its seats are full;
        // sessions at other times block like any booking.
        const same = occupied.find((o) => o.start.getTime() === t);
        if (same ? same.count >= seats : occupied.some((o) => overlaps(padded, o))) continue;
        const { date: attendeeDate } = utcToZoned(start, input.attendeeTz);
        if (attendeeDate < input.from || attendeeDate > input.to) continue;
        const arr = byDay.get(attendeeDate) ?? [];
        if (!arr.some((s) => s.getTime() === start.getTime())) arr.push(start);
        byDay.set(attendeeDate, arr);
        void end;
      }
    }
  }
  const out: DaySlots[] = [];
  for (const date of [...byDay.keys()].sort()) {
    let slots = byDay.get(date)!.sort((a, b) => a.getTime() - b.getTime());
    if (input.maxPerDay) {
      // Count existing bookings on this host-day (approximate by attendee day) toward the cap.
      const existing = [...input.busy, ...occupied].filter(
        (b) => utcToZoned(b.start, input.attendeeTz).date === date,
      ).length;
      const remaining = Math.max(0, input.maxPerDay - existing);
      slots = remaining === 0 ? [] : slots;
    }
    if (slots.length) out.push({ date, slots });
  }
  return out;
}

/** True when `start` is a valid slot for the given inputs (used to validate a booking request). */
export function isSlotAvailable(input: Omit<EngineInput, "from" | "to">, start: Date): boolean {
  const { date } = utcToZoned(start, input.attendeeTz);
  const days = computeSlots({ ...input, from: date, to: date });
  return days.some((d) => d.slots.some((s) => s.getTime() === start.getTime()));
}

/** Seats still free for each slot start (ms epoch), given the sessions already booked. */
export function seatsLeft(seats: number, occupied: Occupied[], slots: Date[]): SeatMap {
  const map: SeatMap = new Map();
  for (const s of slots) {
    const o = occupied.find((x) => x.start.getTime() === s.getTime());
    map.set(s.getTime(), Math.max(0, seats - (o?.count ?? 0)));
  }
  return map;
}
