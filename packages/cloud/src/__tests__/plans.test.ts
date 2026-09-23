import { describe, expect, it } from "vitest";
import {
  billedSeats,
  captureBudget,
  limitsFor,
  monthlyEquivalent,
  monthsFreeYearly,
  planFor,
  planPrice,
  PLANS,
  UNLIMITED,
  withinLimit,
} from "../index";

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
  it("pools Team's capture minutes per member; Pro's are flat", () => {
    expect(captureBudget(PLANS.pro, 5)).toBe(300);
    expect(captureBudget(PLANS.team, 1)).toBe(400); // two seats minimum, two seats of minutes
    expect(captureBudget(PLANS.team, 4)).toBe(800);
    expect(captureBudget(PLANS.free, 3)).toBe(0);
  });
  it("bills Team for at least two seats", () => {
    expect(billedSeats(PLANS.team, 1)).toBe(2);
    expect(billedSeats(PLANS.team, 5)).toBe(5);
    expect(billedSeats(PLANS.pro, 1)).toBe(1);
  });
  it("prices yearly at two months free", () => {
    expect(planPrice(PLANS.pro, "month")).toBe(19);
    expect(planPrice(PLANS.pro, "year")).toBe(190);
    expect(monthlyEquivalent(PLANS.pro, "year")).toBe(15.83);
    expect(monthlyEquivalent(PLANS.team, "year")).toBe(13.33);
    expect(monthsFreeYearly(PLANS.pro)).toBe(2);
    expect(monthsFreeYearly(PLANS.team)).toBe(2);
    expect(monthsFreeYearly(PLANS.free)).toBe(0);
    expect(planPrice(PLANS.free, "year")).toBe(0);
  });
  it("finds the cheapest plan for a need", () => {
    expect(planFor("payments")).toBe("pro");
    expect(planFor("teamScheduling")).toBe("team");
    expect(planFor("members", 3)).toBe("team");
    expect(planFor("eventTypes", 2)).toBe("free");
  });
});
