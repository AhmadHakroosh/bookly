import { describe, expect, it } from "vitest";
import {
  CAPTURE_OVERAGE_PER_HOUR,
  CAPTURE_OVERAGE_PER_MINUTE,
  captureBudget,
  captureHours,
  captureOverageDelta,
  effectivePlan,
  limitsFor,
  monthsFreeYearly,
  planFor,
  PLANS,
} from "@bookly/cloud";

process.env.AUTH_SECRET ??= "test-secret-test-secret-test";
process.env.DATABASE_URL ??= "postgres://x:y@localhost:5432/z";
process.env.APP_URL ??= "http://localhost:3002";

const { eventLocations, pickLocation } = await import("@/server/scheduling");

describe("plans", () => {
  it("prices, seats and fees", () => {
    expect([PLANS.pro.priceMonthly, PLANS.pro.priceYearly]).toEqual([24, 240]);
    expect([PLANS.team.priceMonthly, PLANS.team.priceYearly, PLANS.team.minSeats]).toEqual([
      30, 300, 2,
    ]);
    expect(monthsFreeYearly(PLANS.pro)).toBe(2);
    expect(monthsFreeYearly(PLANS.team)).toBe(2);
    expect([PLANS.free.feePercent, PLANS.pro.feePercent, PLANS.team.feePercent]).toEqual([5, 0, 0]);
  });
  it("gates Bookly video behind Pro and drops it for a lapsed plan", () => {
    expect(PLANS.free.limits.booklyVideo).toBe(false);
    expect(planFor("booklyVideo")).toBe("pro");
    expect(limitsFor("pro", "active").booklyVideo).toBe(true);
    expect(limitsFor("pro", "canceled").booklyVideo).toBe(false);
    expect(effectivePlan("team", "unpaid")?.feePercent).toBe(5);
    expect(effectivePlan("self-hosted")).toBeNull();
  });
  it("pools 480 minutes (8 hours) per billed Team seat and 300 flat on Pro", () => {
    expect(captureBudget(PLANS.pro, 1)).toBe(300);
    expect(captureBudget(PLANS.team, 1)).toBe(960);
    expect(captureBudget(PLANS.team, 4)).toBe(1920);
    expect(captureHours(480)).toBe("8 hours");
    expect(captureBudget(PLANS.free, 1)).toBe(0);
  });
  it("bills only the minutes past the budget", () => {
    expect(CAPTURE_OVERAGE_PER_MINUTE).toBe(0.05);
    expect(captureOverageDelta(0, 30, 300)).toBe(0);
    expect(captureOverageDelta(290, 320, 300)).toBe(20);
    expect(captureOverageDelta(320, 350, 300)).toBe(30);
    expect(captureOverageDelta(0, 30, null)).toBe(0);
    expect(CAPTURE_OVERAGE_PER_HOUR).toBe(3);
    expect(captureHours(300)).toBe("5 hours");
    expect(captureHours(90)).toBe("1.5 hours");
    expect(captureHours(60)).toBe("1 hour");
    expect(captureHours(45)).toBe("45 min");
  });
});

describe("locations without Bookly video", () => {
  const et = {
    location: { type: "daily" as const },
    locations: [{ type: "daily" as const }, { type: "phone" as const, value: "We call you" }],
  };
  it("hides the video rows and keeps the rest", () => {
    expect(eventLocations(et, { video: false }).map((l) => l.type)).toEqual(["phone"]);
    expect(eventLocations(et).map((l) => l.type)).toEqual(["daily", "phone"]);
    expect(pickLocation(et, "daily", { video: false })).toBeNull();
  });
  it("falls back to a video-link note when video was the only option", () => {
    const only = { location: { type: "daily" as const }, locations: [] };
    expect(eventLocations(only, { video: false })).toEqual([
      { type: "custom", value: "Video link sent by email" },
    ]);
  });
});
