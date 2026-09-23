import { describe, expect, it } from "vitest";
import { countryOptions, flagEmoji, formatPhone, looksLikePhone, toE164 } from "@/lib/phone";

describe("phone helpers", () => {
  it("normalises national input with a country to E.164 and rejects nonsense", () => {
    expect(toE164("201 555 0123", "US")).toBe("+12015550123");
    expect(toE164("(0)20 7946 0958", "GB")).toBe("+442079460958");
    expect(toE164("+972 50 123 4567")).toBe("+972501234567");
    expect(toE164("12", "US")).toBeNull();
    expect(toE164("hello", "US")).toBeNull();
  });
  it("formats for display and detects stored numbers", () => {
    expect(formatPhone("+12015550123")).toBe("+1 201 555 0123");
    expect(formatPhone("We call you")).toBe("We call you");
    expect(looksLikePhone("+12015550123")).toBe(true);
    expect(looksLikePhone("We call you")).toBe(false);
  });
  it("lists countries with names, calling codes and flags", () => {
    const list = countryOptions("en");
    const us = list.find((c) => c.code === "US")!;
    expect(us).toMatchObject({ name: "United States", calling: "+1" });
    expect(flagEmoji("IL")).toBe("🇮🇱");
    expect(list.length).toBeGreaterThan(200);
  });
});
