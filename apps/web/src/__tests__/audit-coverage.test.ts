import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/*
 * Every server action that writes workspace data must call `audit()` so the activity log
 * cannot drift. A function that only reads marks itself with a comment inside its body:
 *
 *   // audit: read-only — <why>
 *
 * The test walks every `"use server"` file under `src/app` (plus the shared consent action),
 * takes each exported function's body, and fails when it neither audits nor is marked.
 * Operator console actions write to the operator log (`audit` from `@/server/ops`), which
 * counts: the call shape is the same.
 */

const ROOT = path.resolve(__dirname, "..");
const READ_ONLY = /audit:\s*read-only/;

function walk(dir: string, out: string[] = []) {
  for (const f of readdirSync(dir)) {
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(f)) out.push(p);
  }
  return out;
}

const actionFiles = () =>
  [...walk(path.join(ROOT, "app")), path.join(ROOT, "server/consent-actions.ts")].filter((f) =>
    /^\s*"use server";/m.test(readFileSync(f, "utf8")),
  );

/** `export async function name(` … matching `}` → the body text. */
export function exportedFunctions(src: string): { name: string; body: string }[] {
  const out: { name: string; body: string }[] = [];
  const re = /^export\s+(?:async\s+)?function\s+([A-Za-z0-9_]+)\s*\(/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const open = bodyStart(src, m.index + m[0].length - 1);
    if (open < 0) continue;
    out.push({ name: m[1]!, body: src.slice(open, closeOf(src, open) + 1) });
  }
  return out;
}

/** Index of the matching `}` for the `{` at `open`. */
function closeOf(src: string, open: number) {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return i;
  }
  return src.length - 1;
}

/**
 * From the `(` of a parameter list: the index of the body's `{`, skipping the parameters and a
 * return-type annotation such as `: Promise<{ ok: boolean }>` (a `{` right after `:`, `|`, `&`
 * or `=` is a type literal, not the body).
 */
function bodyStart(src: string, paren: number) {
  let depth = 0;
  let i = paren;
  for (; i < src.length; i++) {
    if (src[i] === "(") depth++;
    else if (src[i] === ")" && --depth === 0) break;
  }
  depth = 0;
  for (i++; i < src.length; i++) {
    const c = src[i];
    if (c === "<" || c === "(" || c === "[") depth++;
    else if (c === ">" || c === ")" || c === "]") depth--;
    else if (c === "{") {
      if (depth > 0) {
        depth++;
        continue;
      }
      const prev = src.slice(0, i).trimEnd().slice(-1);
      if (prev === ":" || prev === "|" || prev === "&" || prev === "=") {
        depth++;
        continue;
      }
      return i;
    } else if (c === "}") depth--;
    else if (c === ";" && depth === 0) return -1; // a declaration without a body
  }
  return -1;
}

const audits = (body: string) => /\baudit\w*\(/.test(body) || READ_ONLY.test(body);

describe("audit coverage", () => {
  const files = actionFiles();

  it("finds the server action files", () => {
    expect(files.length).toBeGreaterThan(15);
  });

  for (const file of files) {
    const rel = path.relative(ROOT, file);
    const src = readFileSync(file, "utf8");
    const fns = exportedFunctions(src);
    // Layouts and pages marked "use server" export components, not actions.
    if (/\.tsx$/.test(file)) continue;
    for (const fn of fns) {
      it(`${rel} › ${fn.name} audits or is marked read-only`, () => {
        // Private helpers called by the exported action may hold the audit call; follow one hop.
        const calls = [...fn.body.matchAll(/\b([a-z][A-Za-z0-9_]*)\(/g)].map((c) => c[1]!);
        const helpers = exportedFunctions(src.replace(/^export\s+/gm, "export "))
          .concat(localFunctions(src))
          .filter((h) => calls.includes(h.name) && h.name !== fn.name);
        const covered = audits(fn.body) || helpers.some((h) => audits(h.body));
        expect(covered, `${fn.name} in ${rel} neither calls audit() nor is marked read-only`).toBe(
          true,
        );
      });
    }
  }
});

/** Non-exported `function name(` / `const name = async (` helpers in the same file. */
function localFunctions(src: string): { name: string; body: string }[] {
  const out: { name: string; body: string }[] = [];
  const re =
    /^(?:async\s+)?function\s+([A-Za-z0-9_]+)\s*\(|^const\s+([A-Za-z0-9_]+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z0-9_]+)\s*(?::[^=]*)?=>\s*\{/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const name = (m[1] ?? m[2])!;
    const open = src.indexOf("{", m.index + m[0].length - 1);
    out.push({ name, body: src.slice(open, closeOf(src, open) + 1) });
  }
  return out;
}
