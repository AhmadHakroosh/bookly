import { describe, expect, it } from "vitest";
import {
  layoutDay,
  monthGrid,
  stepDate,
  viewRange,
  viewTitle,
  visibleHours,
  weekDays,
  weekStart,
} from "@/lib/calendar";

const at = (iso: string) => new Date(iso);

describe("weeks and months", () => {
  it("weeks start on Monday", () => {
    expect(weekStart("2026-10-16")).toBe("2026-10-12"); // Friday → Monday
    expect(weekStart("2026-10-18")).toBe("2026-10-12"); // Sunday → the Monday before
    expect(weekStart("2026-10-12")).toBe("2026-10-12");
    expect(weekDays("2026-10-16")).toEqual([
      "2026-10-12",
      "2026-10-13",
      "2026-10-14",
      "2026-10-15",
      "2026-10-16",
      "2026-10-17",
      "2026-10-18",
    ]);
  });

  it("the month grid is whole weeks covering the month", () => {
    const grid = monthGrid("2026-10-16");
    expect(grid[0]![0]).toBe("2026-09-28"); // Oct 1 2026 is a Thursday
    expect(grid[grid.length - 1]![6]).toBe("2026-11-01");
    for (const week of grid) expect(week).toHaveLength(7);
    expect(grid.flat()).toContain("2026-10-31");
  });

  it("steps by day, week and month (month steps land on the 1st)", () => {
    expect(stepDate("day", "2026-10-31", 1)).toBe("2026-11-01");
    expect(stepDate("week", "2026-10-16", -1)).toBe("2026-10-09");
    expect(stepDate("month", "2026-01-31", 1)).toBe("2026-02-01");
    expect(stepDate("month", "2026-01-15", -1)).toBe("2025-12-01");
  });

  it("titles read naturally", () => {
    expect(viewTitle("day", "2026-10-16")).toBe("Friday, October 16, 2026");
    expect(viewTitle("week", "2026-10-16")).toBe("Oct 12 – 18, 2026");
    expect(viewTitle("week", "2026-10-29")).toBe("Oct 26 – Nov 1, 2026");
    expect(viewTitle("month", "2026-10-16")).toBe("October 2026");
  });

  it("ranges are bounded in the viewer's timezone", () => {
    const r = viewRange("week", "2026-10-16", "Asia/Jerusalem");
    expect(r.from.toISOString()).toBe("2026-10-11T21:00:00.000Z");
    expect(r.to.toISOString()).toBe("2026-10-18T21:00:00.000Z");
    expect(viewRange("day", "2026-10-16", "UTC").days).toEqual(["2026-10-16"]);
  });
});

describe("day layout", () => {
  const tz = "UTC";
  it("places items by local minutes and gives overlaps their own columns", () => {
    const items = [
      { id: "a", startAt: at("2026-10-16T09:00:00Z"), endAt: at("2026-10-16T10:00:00Z") },
      { id: "b", startAt: at("2026-10-16T09:30:00Z"), endAt: at("2026-10-16T10:30:00Z") },
      { id: "c", startAt: at("2026-10-16T11:00:00Z"), endAt: at("2026-10-16T11:30:00Z") },
    ];
    const placed = layoutDay(items, "2026-10-16", tz);
    const by = Object.fromEntries(placed.map((p) => [p.id, p]));
    expect(by.a!.startMin).toBe(540);
    expect([by.a!.col, by.b!.col]).toEqual([0, 1]);
    expect([by.a!.cols, by.b!.cols]).toEqual([2, 2]);
    expect([by.c!.col, by.c!.cols]).toEqual([0, 1]); // its own cluster
  });

  it("reuses a freed column inside a cluster", () => {
    const items = [
      { id: "long", startAt: at("2026-10-16T09:00:00Z"), endAt: at("2026-10-16T12:00:00Z") },
      { id: "x", startAt: at("2026-10-16T09:00:00Z"), endAt: at("2026-10-16T10:00:00Z") },
      { id: "y", startAt: at("2026-10-16T10:00:00Z"), endAt: at("2026-10-16T11:00:00Z") },
    ];
    const by = Object.fromEntries(layoutDay(items, "2026-10-16", tz).map((p) => [p.id, p]));
    expect(by.x!.col).toBe(1);
    expect(by.y!.col).toBe(1);
    expect(by.long!.cols).toBe(2);
  });

  it("clips items that cross midnight and skips other days", () => {
    const items = [
      { id: "late", startAt: at("2026-10-15T23:00:00Z"), endAt: at("2026-10-16T01:00:00Z") },
      { id: "other", startAt: at("2026-10-17T09:00:00Z"), endAt: at("2026-10-17T10:00:00Z") },
    ];
    const placed = layoutDay(items, "2026-10-16", tz);
    expect(placed.map((p) => p.id)).toEqual(["late"]);
    expect([placed[0]!.startMin, placed[0]!.endMin]).toEqual([0, 60]);
  });

  it("uses the viewer's timezone for the day", () => {
    const items = [
      { id: "a", startAt: at("2026-10-16T22:30:00Z"), endAt: at("2026-10-16T23:00:00Z") },
    ];
    expect(layoutDay(items, "2026-10-17", "Asia/Jerusalem")[0]!.startMin).toBe(90); // 01:30
    expect(layoutDay(items, "2026-10-16", "Asia/Jerusalem")).toHaveLength(0);
  });

  it("widens the visible hours to fit early and late items", () => {
    expect(visibleHours([])).toEqual([7, 20]);
    expect(visibleHours([{ startMin: 6 * 60, endMin: 22 * 60 + 30 }])).toEqual([6, 23]);
  });
});
