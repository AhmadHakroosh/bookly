import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { COMPARISONS } from "@/app/(platform)/platform/compare/data";
import { FOOTER, MENUS } from "@/app/(platform)/platform/site";

const platformDir = path.join(__dirname, "../app/(platform)/platform");
const docsDir = path.join(__dirname, "../../../../docs");
const proxy = readFileSync(path.join(__dirname, "../proxy.ts"), "utf8");

const internalLinks = [
  ...Object.values(MENUS).flatMap((m) => [
    ...m.groups.flatMap((g) => g.items.map((i) => i.href)),
    m.featured.href,
  ]),
  ...Object.values(FOOTER).flatMap((links) => links.map((l) => l.href)),
].filter((h) => h.startsWith("/"));

describe("marketing site", () => {
  it("links only to pages that exist and that the proxy serves on the platform host", () => {
    for (const href of internalLinks) {
      const [route] = href.split("#");
      const [, top, sub] = route!.split("/");
      if (top === "docs") {
        if (sub) expect(existsSync(path.join(docsDir, `${sub}.md`)), href).toBe(true);
        continue;
      }
      expect(existsSync(path.join(platformDir, top!)), href).toBe(true);
      expect(proxy, `${top} in MARKETING_PATHS`).toContain(`"${top}"`);
    }
  });

  it("has one comparison per footer link, each with a source for every claim it makes", () => {
    const footer = FOOTER.Compare!.map((l) => l.href).filter((h) => h !== "/compare");
    expect(footer.sort()).toEqual(COMPARISONS.map((c) => `/compare/${c.slug}`).sort());
    for (const c of COMPARISONS) {
      expect(c.verified).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(c.ahead.length, `${c.name}: credit where due`).toBeGreaterThanOrEqual(3);
      for (const r of c.rows) {
        const unlisted = /^(None listed|Not listed|Interview scheduling not listed)/.test(r.them);
        if (!unlisted) expect(r.source, `${c.name} / ${r.feature}`).toMatch(/^https:\/\//);
      }
      for (const s of c.sources) expect(s).toMatch(/^https:\/\//);
    }
  });

  it("says when a hiring capability is still planned", () => {
    for (const c of COMPARISONS.filter((x) => x.group === "hiring"))
      expect(
        c.rows.some((r) => r.bookly.includes("Coming in Bookly 1.0")),
        c.name,
      ).toBe(true);
  });
});
