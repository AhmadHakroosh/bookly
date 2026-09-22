import { describe, expect, it } from "vitest";

process.env.AUTH_SECRET ??= "test-secret-test-secret-test";
process.env.DATABASE_URL ??= "postgres://x:y@localhost:5432/z";
process.env.APP_URL ??= "http://localhost:3002";

const { eventLocations, locationsLabel, parseLocations, pickLocation } =
  await import("@/server/scheduling");

describe("event type locations", () => {
  it("parses the editor's JSON, dropping unknown and duplicate types and empty values", () => {
    const locs = parseLocations(
      JSON.stringify([
        { type: "zoom" },
        { type: "phone", value: "  +1 555 0100 " },
        { type: "zoom", value: "dup" },
        { type: "carrier-pigeon" },
        { type: "custom", value: "" },
      ]),
    );
    expect(locs).toEqual([
      { type: "zoom" },
      { type: "phone", value: "+1 555 0100" },
      { type: "custom" },
    ]);
  });
  it("falls back to the legacy single fields and survives bad JSON", () => {
    expect(parseLocations("", "in_person", "12 Main St")).toEqual([
      { type: "in_person", value: "12 Main St" },
    ]);
    expect(parseLocations("{not json", "daily")).toEqual([{ type: "daily" }]);
    expect(parseLocations("")).toEqual([]);
  });
  it("offers the legacy location when the list is empty and labels a list", () => {
    const et = { location: { type: "daily" as const }, locations: [] };
    expect(eventLocations(et)).toEqual([{ type: "daily" }]);
    expect(locationsLabel(eventLocations(et))).toBe("Bookly video");
    const many = {
      location: { type: "daily" as const },
      locations: [
        { type: "daily" as const },
        { type: "zoom" as const },
        { type: "phone" as const },
      ],
    };
    expect(locationsLabel(eventLocations(many))).toBe("Bookly video, Zoom or Phone call");
  });
  it("resolves the attendee's pick, the only option, or nothing when a choice is needed", () => {
    const many = {
      location: { type: "daily" as const },
      locations: [{ type: "daily" as const }, { type: "zoom" as const }],
    };
    expect(pickLocation(many, "zoom")).toEqual({ type: "zoom" });
    expect(pickLocation(many, "teams")).toBeNull();
    expect(pickLocation(many, null)).toBeNull();
    expect(pickLocation({ location: { type: "phone" as const }, locations: [] }, null)).toEqual({
      type: "phone",
    });
  });
});
