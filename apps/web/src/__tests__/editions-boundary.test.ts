import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/*
 * The open-core line is one directory (ADR 0006). The AGPL core never imports `ee/`: it reaches
 * commercial modules only through the generated registry, so deleting `ee/` leaves a complete
 * product. And `ee/` never imports app internals: what a module needs comes in as CoreServices.
 */

const REPO = path.resolve(__dirname, "../../../..");
const REGISTRY = path.join(REPO, "apps/web/src/server/editions/registry.generated.ts");

function walk(dir: string, out: string[] = []) {
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir)) {
    if (f === "node_modules" || f === ".next" || f === "dist") continue;
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|mjs|js)$/.test(f)) out.push(p);
  }
  return out;
}

const imports = (src: string) =>
  [...src.matchAll(/(?:from\s+|import\s*\(\s*|require\s*\(\s*)["']([^"']+)["']/g)].map(
    (m) => m[1]!,
  );

const rel = (f: string) => path.relative(REPO, f);

describe("open-core boundary", () => {
  it("core reaches ee/ only through the generated registry", () => {
    const core = [...walk(path.join(REPO, "apps/web/src")), ...walk(path.join(REPO, "packages"))];
    const offenders = core
      .filter((f) => f !== REGISTRY && !f.endsWith("editions-boundary.test.ts"))
      .flatMap((f) =>
        imports(readFileSync(f, "utf8"))
          .filter((i) => i.startsWith("@bookly/ee-") || /(^|\/)ee\//.test(i))
          .map((i) => `${rel(f)} imports ${i}`),
      );
    expect(offenders).toEqual([]);
  });

  it("ee/ never imports the app", () => {
    const offenders = walk(path.join(REPO, "ee")).flatMap((f) =>
      imports(readFileSync(f, "utf8"))
        .filter((i) => i.startsWith("@/") || i.includes("apps/web") || i === "@bookly/web")
        .map((i) => `${rel(f)} imports ${i}`),
    );
    expect(offenders).toEqual([]);
  });

  it("every ee/ source file carries the Elastic License header", () => {
    const missing = walk(path.join(REPO, "ee"))
      .filter((f) => /\.(ts|tsx)$/.test(f))
      .filter((f) => !readFileSync(f, "utf8").startsWith("// SPDX-License-Identifier: Elastic-2.0"))
      .map(rel);
    expect(missing).toEqual([]);
  });
});
