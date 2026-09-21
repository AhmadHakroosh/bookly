import { describe, expect, it } from "vitest";
import { computeSlots, isSlotAvailable, windowsForDate } from "@/server/availability/engine";
import { utcToZoned, zonedToUtc } from "@/lib/time";

const tz = "Asia/Jerusalem"; // UTC+3 in September 2026
const rules = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, startMin: 9 * 60, endMin: 17 * 60 })); // Mon–Fri 9–17
const now = new Date("2026-09-21T06:00:00Z"); // Monday 09:00 local

const base = {
  scheduleTz: tz,
  rules,
  overrides: [],
  durationMin: 30,
  busy: [],
  attendeeTz: tz,
  now,
  minNoticeMin: 0,
};

describe("time helpers", () => {
  it("converts local wall-clock time to the right instant and back", () => {
    const t = zonedToUtc("2026-09-21", 9 * 60, tz);
    expect(t.toISOString()).toBe("2026-09-21T06:00:00.000Z");
    expect(utcToZoned(t, tz)).toEqual({ date: "2026-09-21", minutes: 540, weekday: 1 });
  });
});

describe("computeSlots", () => {
  it("produces 30-minute slots inside working hours and none on weekends", () => {
    const days = computeSlots({ ...base, from: "2026-09-21", to: "2026-09-27" });
    expect(days.map((d) => d.date)).toEqual([
      "2026-09-21",
      "2026-09-22",
      "2026-09-23",
      "2026-09-24",
      "2026-09-25",
    ]);
    expect(days[0]!.slots).toHaveLength(16); // 9:00 … 16:30
    expect(utcToZoned(days[0]!.slots[0]!, tz).minutes).toBe(540);
  });

  it("removes booked time plus buffers", () => {
    const booked = {
      start: zonedToUtc("2026-09-22", 10 * 60, tz),
      end: zonedToUtc("2026-09-22", 10 * 60 + 30, tz),
    };
    const days = computeSlots({
      ...base,
      busy: [booked],
      bufferBeforeMin: 15,
      bufferAfterMin: 15,
      from: "2026-09-22",
      to: "2026-09-22",
    });
    const mins = days[0]!.slots.map((s) => utcToZoned(s, tz).minutes);
    expect(mins).not.toContain(600); // 10:00 booked
    expect(mins).not.toContain(570); // 9:30 would end 10:00, inside the 15-min buffer
    expect(mins).not.toContain(630); // 10:30 starts inside the after-buffer
    expect(mins).toContain(540);
    expect(mins).toContain(660); // 11:00 ok
  });

  it("honors overrides: blocked day and custom hours", () => {
    const overrides = [
      { date: "2026-09-23", startMin: null, endMin: null },
      { date: "2026-09-24", startMin: 13 * 60, endMin: 14 * 60 },
    ];
    const days = computeSlots({ ...base, overrides, from: "2026-09-23", to: "2026-09-24" });
    expect(days.map((d) => d.date)).toEqual(["2026-09-24"]);
    expect(days[0]!.slots).toHaveLength(2);
  });

  it("applies minimum notice and the booking horizon", () => {
    const days = computeSlots({
      ...base,
      minNoticeMin: 120,
      maxDaysAhead: 1,
      from: "2026-09-21",
      to: "2026-09-25",
    });
    expect(days[0]!.date).toBe("2026-09-21");
    expect(utcToZoned(days[0]!.slots[0]!, tz).minutes).toBe(11 * 60); // 09:00 + 2h notice
    expect(days.map((d) => d.date)).toEqual(["2026-09-21", "2026-09-22"]);
  });

  it("groups slots by the attendee's day in another timezone", () => {
    const days = computeSlots({
      ...base,
      attendeeTz: "America/Los_Angeles",
      from: "2026-09-21",
      to: "2026-09-21",
    });
    // Jerusalem Mon 09:00–17:00 = LA Sun 23:00 – Mon 07:00, and Jerusalem Tue 09:00–17:00 = LA Mon 23:00 – Tue 07:00.
    // LA Monday therefore gets 00:00–06:30 (from Mon) and 23:00–23:30 (from Tue).
    expect(days).toHaveLength(1);
    const mins = days[0]!.slots.map((s) => utcToZoned(s, "America/Los_Angeles").minutes);
    expect(Math.min(...mins)).toBe(0);
    expect(Math.max(...mins)).toBe(23 * 60 + 30);
    expect(mins).toContain(6 * 60 + 30);
    expect(mins).not.toContain(7 * 60);
    expect(days[0]!.slots).toHaveLength(14 + 2);
  });

  it("validates a specific slot", () => {
    const ok = zonedToUtc("2026-09-22", 9 * 60, tz);
    const bad = zonedToUtc("2026-09-22", 9 * 60 + 10, tz);
    expect(isSlotAvailable(base, ok)).toBe(true);
    expect(isSlotAvailable(base, bad)).toBe(false);
  });

  it("windowsForDate falls back to weekly rules when no override exists", () => {
    expect(windowsForDate("2026-09-26", rules, [], tz)).toEqual([]); // Saturday
    expect(windowsForDate("2026-09-21", rules, [], tz)).toHaveLength(1);
  });
});

describe("priority-aware availability", () => {
  const focusRules = [
    { weekday: 1, startMin: 9 * 60, endMin: 12 * 60 },
    { weekday: 1, startMin: 13 * 60, endMin: 17 * 60, kind: "focus" as const },
  ];
  it("hides focus blocks from regular visitors and shows them to priority contacts", () => {
    const regular = computeSlots({
      ...base,
      rules: focusRules,
      from: "2026-09-21",
      to: "2026-09-21",
    });
    const vip = computeSlots({
      ...base,
      rules: focusRules,
      priority: true,
      from: "2026-09-21",
      to: "2026-09-21",
    });
    expect(regular[0]!.slots).toHaveLength(6); // 9:00 … 11:30
    expect(vip[0]!.slots).toHaveLength(14); // plus 13:00 … 16:30
  });
  it("closes the week to regular visitors once the budget is used up", () => {
    const busy = [0, 1, 2].map((i) => ({
      start: zonedToUtc("2026-09-22", 9 * 60 + i * 60, tz),
      end: zonedToUtc("2026-09-22", 9 * 60 + i * 60 + 30, tz),
    }));
    const capped = computeSlots({
      ...base,
      busy,
      weeklyBudget: 3,
      from: "2026-09-23",
      to: "2026-09-23",
    });
    expect(capped).toEqual([]);
    const nextWeek = computeSlots({
      ...base,
      busy,
      weeklyBudget: 3,
      from: "2026-09-28",
      to: "2026-09-28",
    });
    expect(nextWeek[0]!.slots.length).toBeGreaterThan(0);
    const vip = computeSlots({
      ...base,
      busy,
      weeklyBudget: 3,
      priority: true,
      from: "2026-09-23",
      to: "2026-09-23",
    });
    expect(vip[0]!.slots.length).toBeGreaterThan(0);
  });
});
