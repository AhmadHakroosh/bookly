import { describe, expect, it } from "vitest";
import { ARD_CONTEXT, buildArdManifest, SKILL_MEDIA_TYPE, SKILL_PATH, toDateTime } from "@/lib/ard";

/*
 * The checks Lighthouse's `ard-schema` audit runs (its port of the ARD conformance tester):
 * an `entries` array; per entry an `urn:air:` identifier, `displayName`, a media type from the
 * standard list, exactly one of `url`/`data`, and 2 to 5 `representativeQueries`. Anything
 * short of that is a warning, which costs the perfect score.
 */
const URN = /^urn:air:([a-zA-Z0-9.-]+)(?::([a-zA-Z0-9._:-]+))?:([a-zA-Z0-9._-]+)$/;
const STANDARD_TYPES = new Set([
  "application/ai-catalog+json",
  "application/agent-card+json",
  "application/a2a-agent-card+json",
  "application/mcp-server-card+json",
  "application/agent-skills+zip",
  "application/agent-skills+gzip",
  'text/markdown; profile="urn:air:agent-skills"',
  "application/ai-registry",
  "application/ai-registry+json",
]);

const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

const manifest = buildArdManifest({
  base: "https://bookly-app.io",
  name: "Bookly",
  version: "0.12.1",
  updatedAt: "2026-10-15",
});

describe("ARD manifest", () => {
  it("has the shape consumers require", () => {
    expect(manifest.specVersion).toBe("1.0");
    expect(Array.isArray(manifest.entries)).toBe(true);
    expect(manifest.entries.length).toBeGreaterThan(0);
  });

  it("every entry passes the conformance rules without warnings", () => {
    for (const e of manifest.entries) {
      expect(e.identifier).toMatch(URN);
      expect(e.identifier.startsWith("urn:air:bookly-app.io:")).toBe(true);
      expect(e.displayName.length).toBeGreaterThan(0);
      expect(STANDARD_TYPES.has(e.type)).toBe(true);
      expect("url" in e && !("data" in e)).toBe(true);
      expect(e.url.startsWith("https://bookly-app.io/")).toBe(true);
      expect(e.representativeQueries.length).toBeGreaterThanOrEqual(2);
      expect(e.representativeQueries.length).toBeLessThanOrEqual(5);
      for (const q of e.representativeQueries) expect(typeof q).toBe("string");
      expect(e["@context"]).toBe(ARD_CONTEXT);
      // The schema's format rules: `updatedAt` is an RFC 3339 date-time, `url` an absolute URI.
      expect(e.updatedAt).toMatch(RFC3339);
      expect(() => new URL(e.url)).not.toThrow();
    }
  });

  it("points at the scheduling skill", () => {
    const skill = manifest.entries.find((e) => e.identifier.endsWith(":skills:scheduling"));
    expect(skill?.type).toBe(SKILL_MEDIA_TYPE);
    expect(skill?.url).toBe(`https://bookly-app.io${SKILL_PATH}`);
  });
});

describe("toDateTime", () => {
  it("turns a date into midnight UTC and normalises date-times", () => {
    expect(toDateTime("2026-10-02")).toBe("2026-10-02T00:00:00Z");
    expect(toDateTime("2026-10-02T10:30:00.000Z")).toBe("2026-10-02T10:30:00Z");
    expect(() => toDateTime("soon")).toThrow();
  });
});
