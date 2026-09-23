import { describe, expect, it } from "vitest";
import { COLOR_PRESETS, normalizeHex } from "@/components/color-picker";

describe("normalizeHex", () => {
  it("accepts 3- and 6-digit hex with or without the hash, lowercased", () => {
    expect(normalizeHex("#2563EB")).toBe("#2563eb");
    expect(normalizeHex("2563eb")).toBe("#2563eb");
    expect(normalizeHex("#abc")).toBe("#aabbcc");
    expect(normalizeHex("blue")).toBeNull();
    expect(normalizeHex("#12345")).toBeNull();
    for (const c of COLOR_PRESETS) expect(normalizeHex(c)).toBe(c);
  });
});
