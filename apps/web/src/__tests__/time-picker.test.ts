import { describe, expect, it } from "vitest";
import { timeOptions } from "@/components/time-picker";

describe("timeOptions", () => {
  it("covers the day in steps and keeps an off-grid current value in order", () => {
    const t = timeOptions(15);
    expect(t).toHaveLength(96);
    expect(t[0]).toBe("00:00");
    expect(t[95]).toBe("23:45");
    const withOdd = timeOptions(15, "09:10");
    expect(withOdd.indexOf("09:10")).toBe(withOdd.indexOf("09:00") + 1);
    expect(timeOptions(30, "09:00")).toHaveLength(48);
  });
});
