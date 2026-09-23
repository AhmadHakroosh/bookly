import { describe, expect, it } from "vitest";
import { localeLabel, localeOptions } from "@/lib/locales";

describe("locales", () => {
  it("names locales in English with the native name, and keeps an unknown stored tag", () => {
    expect(localeLabel("de")).toBe("German (Deutsch)");
    expect(localeLabel("en-GB")).toMatch(/^English \(United Kingdom\)|^British English/);
    const opts = localeOptions("xx-YY");
    expect(opts[0]!.value).toBe("xx-YY");
    expect(opts.some((o) => o.value === "en")).toBe(true);
  });
});
