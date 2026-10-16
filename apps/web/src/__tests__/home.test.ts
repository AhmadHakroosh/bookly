import { describe, expect, it } from "vitest";
import { monthStart, weekBounds } from "@/server/home";

describe("Home date windows", () => {
  it("weeks start on Monday 00:00 in the viewer's timezone", () => {
    // Thursday 2026-10-15 22:30 UTC is already Friday 01:30 in Jerusalem (UTC+3).
    const now = new Date("2026-10-15T22:30:00Z");
    const { start, end } = weekBounds("Asia/Jerusalem", now);
    expect(start.toISOString()).toBe("2026-10-11T21:00:00.000Z"); // Mon 12 Oct 00:00 +03
    expect(end.getTime() - start.getTime()).toBe(7 * 86_400_000);
    const ny = weekBounds("America/New_York", now);
    expect(ny.start.toISOString()).toBe("2026-10-12T04:00:00.000Z"); // Mon 12 Oct 00:00 -04
  });

  it("a Sunday belongs to the week that started the Monday before", () => {
    const sunday = new Date("2026-10-18T12:00:00Z");
    expect(weekBounds("UTC", sunday).start.toISOString()).toBe("2026-10-12T00:00:00.000Z");
  });

  it("months start on the 1st at midnight in the viewer's timezone", () => {
    const now = new Date("2026-10-31T23:30:00Z"); // already November 1st in Jerusalem
    expect(monthStart("Asia/Jerusalem", now).toISOString()).toBe("2026-10-31T22:00:00.000Z");
    expect(monthStart("UTC", now).toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });
});
