import { describe, expect, it } from "vitest";
import { limitsFor, planFor, PLANS, UNLIMITED, withinLimit } from "../index";

describe("plans", () => {
  it("self-hosted and unknown plans are unlimited", () => {
    expect(limitsFor("self-hosted")).toBe(UNLIMITED);
    expect(limitsFor("enterprise")).toBe(UNLIMITED);
  });
  it("lapsed paid plans fall back to free", () => {
    expect(limitsFor("pro", "active")).toBe(PLANS.pro.limits);
    expect(limitsFor("pro", "canceled")).toBe(PLANS.free.limits);
    expect(limitsFor("free", "canceled")).toBe(PLANS.free.limits);
  });
  it("counts limits", () => {
    expect(withinLimit(PLANS.free.limits, "eventTypes", 1)).toBe(true);
    expect(withinLimit(PLANS.free.limits, "eventTypes", 2)).toBe(false);
    expect(withinLimit(PLANS.pro.limits, "eventTypes", 999)).toBe(true);
  });
  it("finds the cheapest plan for a need", () => {
    expect(planFor("payments")).toBe("pro");
    expect(planFor("teamScheduling")).toBe("team");
    expect(planFor("members", 3)).toBe("team");
    expect(planFor("eventTypes", 2)).toBe("free");
  });
});
