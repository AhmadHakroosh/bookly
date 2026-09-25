import { describe, expect, it } from "vitest";
import { computeSlots, withoutSessionEchoes } from "@/server/availability/engine";

const at = (iso: string) => new Date(iso);
const session = { start: at("2026-10-06T10:00:00Z"), end: at("2026-10-06T11:00:00Z"), count: 1 };

describe("withoutSessionEchoes", () => {
  it("removes busy time that coincides with a booked session of the same event type", () => {
    const busy = [
      { start: session.start, end: session.end },
      { start: at("2026-10-06T13:00:00Z"), end: at("2026-10-06T14:00:00Z") },
    ];
    expect(withoutSessionEchoes(busy, [session])).toEqual([busy[1]]);
  });
  it("keeps busy time that merely overlaps a session", () => {
    const busy = [{ start: at("2026-10-06T10:30:00Z"), end: at("2026-10-06T11:30:00Z") }];
    expect(withoutSessionEchoes(busy, [session])).toEqual(busy);
  });
});

describe("a half-full group session stays bookable", () => {
  const input = {
    scheduleTz: "UTC",
    rules: [{ weekday: 2, startMin: 9 * 60, endMin: 12 * 60 }],
    overrides: [],
    durationMin: 60,
    slotIntervalMin: 60,
    bufferBeforeMin: 0,
    bufferAfterMin: 0,
    minNoticeMin: 0,
    maxDaysAhead: 365,
    seats: 3,
    attendeeTz: "UTC",
    from: "2026-10-06",
    to: "2026-10-06",
    now: at("2026-10-01T00:00:00Z"),
  };
  it("is blocked when the calendar echo is left in", () => {
    const days = computeSlots({ ...input, busy: [session], occupied: [session] });
    expect(days[0]?.slots.map((s) => s.toISOString())).not.toContain("2026-10-06T10:00:00.000Z");
  });
  it("is offered once the echo is removed", () => {
    const busy = withoutSessionEchoes([session], [session]);
    const days = computeSlots({ ...input, busy, occupied: [session] });
    expect(days[0]?.slots.map((s) => s.toISOString())).toContain("2026-10-06T10:00:00.000Z");
  });
});
