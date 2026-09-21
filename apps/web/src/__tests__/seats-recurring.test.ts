import { describe, expect, it } from "vitest";
import { computeSlots, isSlotAvailable, seatsLeft } from "@/server/availability/engine";
import { buildIcsCalendar } from "@/server/ics";
import { zonedToUtc } from "@/lib/time";
import { describeRecurrence, occurrences, recurrenceOf } from "@/server/recurrence";

const tz = "Asia/Jerusalem";
const rules = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, startMin: 9 * 60, endMin: 17 * 60 }));
const now = new Date("2026-09-21T06:00:00Z"); // Monday 09:00 local
const base = {
  scheduleTz: tz,
  rules,
  overrides: [],
  durationMin: 60,
  busy: [],
  attendeeTz: tz,
  now,
  minNoticeMin: 0,
};
const at = (date: string, hhmm: number) => zonedToUtc(date, hhmm, tz);

describe("group events (seats)", () => {
  const start = at("2026-09-22", 10 * 60);
  const session = { start, end: at("2026-09-22", 11 * 60), count: 2 };

  it("keeps a session bookable until its seats are full", () => {
    const open = { ...base, seats: 3, occupied: [session] };
    expect(isSlotAvailable(open, start)).toBe(true);
    const full = { ...base, seats: 2, occupied: [session] };
    expect(isSlotAvailable(full, start)).toBe(false);
  });

  it("blocks overlapping starts like a normal booking", () => {
    const input = { ...base, seats: 5, occupied: [session], slotIntervalMin: 30 };
    expect(isSlotAvailable(input, at("2026-09-22", 10 * 60 + 30))).toBe(false);
    expect(isSlotAvailable(input, at("2026-09-22", 11 * 60))).toBe(true);
  });

  it("reports seats left per slot", () => {
    const slots = computeSlots({
      ...base,
      seats: 3,
      occupied: [session],
      from: "2026-09-22",
      to: "2026-09-22",
    })[0]!.slots;
    const left = seatsLeft(3, [session], slots);
    expect(left.get(start.getTime())).toBe(1);
    expect(left.get(at("2026-09-22", 9 * 60).getTime())).toBe(3);
  });
});

describe("recurrence", () => {
  it("normalises the rule and describes it", () => {
    expect(recurrenceOf({})).toBeNull();
    expect(recurrenceOf({ enabled: true })).toEqual({ freq: "weekly", interval: 1, count: 2 });
    expect(recurrenceOf({ enabled: true, freq: "daily", interval: 2, count: 99 })).toEqual({
      freq: "daily",
      interval: 2,
      count: 52,
    });
    expect(describeRecurrence({ freq: "weekly", interval: 1, count: 6 })).toBe(
      "Every week, 6 times",
    );
    expect(describeRecurrence({ freq: "monthly", interval: 2, count: 3 })).toBe(
      "Every 2 months, 3 times",
    );
  });

  it("keeps the wall-clock time across a daylight-saving change", () => {
    // Israel leaves DST on 2026-10-25; a weekly 10:00 must stay at 10:00 local.
    const first = at("2026-10-19", 10 * 60);
    const dates = occurrences(first, tz, { freq: "weekly", interval: 1, count: 3 });
    expect(dates.map((d) => d.toISOString())).toEqual([
      "2026-10-19T07:00:00.000Z",
      "2026-10-26T08:00:00.000Z",
      "2026-11-02T08:00:00.000Z",
    ]);
  });

  it("clamps monthly occurrences to the last day of shorter months", () => {
    const first = at("2026-01-31", 9 * 60);
    const dates = occurrences(first, tz, { freq: "monthly", interval: 1, count: 3 });
    expect(dates.map((d) => d.toISOString().slice(0, 10))).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
    ]);
  });
});

describe("ics calendars", () => {
  it("ships every occurrence of a series as its own event", () => {
    const ics = buildIcsCalendar(
      [1, 2, 3].map((i) => ({
        uid: `b${i}@bookly`,
        start: new Date(`2026-10-0${i}T07:00:00Z`),
        end: new Date(`2026-10-0${i}T08:00:00Z`),
        summary: `Session ${i}`,
      })),
      "REQUEST",
    );
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(3);
    expect(ics.match(/BEGIN:VCALENDAR/g)).toHaveLength(1);
    expect(ics).toContain("UID:b3@bookly");
  });
});

describe("group session guest lists", () => {
  it("builds provider patch bodies from the attendee list", async () => {
    const { googleAttendeesBody } = await import("@/server/integrations/google");
    const { microsoftAttendeesBody } = await import("@/server/integrations/microsoft");
    const people = [
      { name: "A", email: "a@x.io" },
      { name: "B", email: "b@x.io" },
    ];
    expect(googleAttendeesBody(people)).toEqual({
      attendees: [
        { email: "a@x.io", displayName: "A" },
        { email: "b@x.io", displayName: "B" },
      ],
    });
    expect(microsoftAttendeesBody(people).attendees).toHaveLength(2);
    expect(microsoftAttendeesBody(people).attendees[0]).toEqual({
      emailAddress: { address: "a@x.io", name: "A" },
      type: "required",
    });
  });
});
