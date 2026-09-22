import { describe, expect, it } from "vitest";
import { compareVersions, updateAvailable } from "@/server/telemetry-text";

describe("compareVersions", () => {
  it("orders dotted versions numerically", () => {
    expect(compareVersions("0.1.0", "0.1.0")).toBe(0);
    expect(compareVersions("0.2.0", "0.10.0")).toBeLessThan(0);
    expect(compareVersions("v1.0.0", "0.9.9")).toBeGreaterThan(0);
    expect(compareVersions("1.0", "1.0.0")).toBe(0);
  });
});

describe("updateAvailable", () => {
  it("is true only for a strictly newer announced version", () => {
    expect(updateAvailable("0.1.0", { latest: "0.1.1", url: "" })).toBe(true);
    expect(updateAvailable("0.1.0", { latest: "0.1.0", url: "" })).toBe(false);
    expect(updateAvailable("0.2.0", { latest: "0.1.9", url: "" })).toBe(false);
    expect(updateAvailable("0.1.0", null)).toBe(false);
  });
});
