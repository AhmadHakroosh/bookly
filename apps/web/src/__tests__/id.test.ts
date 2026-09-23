import { describe, expect, it } from "vitest";
import { shortId } from "@/lib/id";

describe("shortId", () => {
  it("makes lowercase alphanumeric ids of the requested length that do not repeat", () => {
    const ids = new Set(Array.from({ length: 200 }, () => shortId()));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]{8}$/);
    expect(shortId(6)).toHaveLength(6);
  });
});
