import { describe, expect, it } from "vitest";
import { parseGuests } from "@/lib/guests";

describe("parseGuests", () => {
  it("accepts one address per line or comma-separated, lowercased and deduplicated", () => {
    expect(parseGuests("Ann@Example.com\nbob@example.com, ann@example.com")).toEqual({
      guests: ["ann@example.com", "bob@example.com"],
      invalid: [],
    });
  });
  it("drops the attendee's own address and reports invalid ones", () => {
    expect(parseGuests(["me@example.com", "not-an-email"], { exclude: "ME@example.com" })).toEqual({
      guests: [],
      invalid: ["not-an-email"],
    });
  });
  it("treats empty input as no guests", () => {
    expect(parseGuests(undefined)).toEqual({ guests: [], invalid: [] });
    expect(parseGuests(" \n ")).toEqual({ guests: [], invalid: [] });
  });
});
