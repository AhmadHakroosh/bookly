import { readFileSync, globSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/*
 * US English in everything a person reads (founder decision, 2026-10-25): interface text, emails,
 * plans and docs. Only prose is checked: string literals and JSX text that contain a space, and
 * Markdown outside code. Data stays as it is: `booking.cancelled`, a `"cancelled"` status, CSS
 * and identifiers are single tokens or code, and comments are not checked.
 */

const ROOT = path.resolve(__dirname, "../../../..");
const BRITISH =
  /(?<![\w.\-/@#])(colours?|coloured|organis(?:e|ed|es|ation|ations)|cancell(?:ed|ing)|behaviours?|licences?|summaris(?:e|ed|es|ing)|recognis(?:e|ed|es)|authoris(?:e|ed)|customis(?:e|ed)|labell(?:ed|ing)|neighbours?|grey|catalogue|prioritise|analyse|centre|favourite|honour|programme)(?![\w-])/i;

const sources = [
  "apps/web/src/**/*.{ts,tsx}",
  "packages/email/src/**/*.{ts,tsx}",
  "packages/cloud/src/**/*.ts",
];

/** Inside sql`…` (or any tagged template): a query or markup, not prose. */
function inTaggedTemplate(n: ts.Node): boolean {
  for (let p = n.parent; p && !ts.isStatement(p); p = p.parent)
    if (ts.isTaggedTemplateExpression(p)) return true;
  return false;
}

function proseIn(file: string): string[] {
  const src = readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true);
  const found: string[] = [];
  const visit = (n: ts.Node) => {
    const k = n.kind;
    if (
      k === ts.SyntaxKind.StringLiteral ||
      k === ts.SyntaxKind.NoSubstitutionTemplateLiteral ||
      k === ts.SyntaxKind.TemplateHead ||
      k === ts.SyntaxKind.TemplateMiddle ||
      k === ts.SyntaxKind.TemplateTail ||
      k === ts.SyntaxKind.JsxText
    ) {
      const text = n.getText(sf);
      const parent = n.parent;
      const code =
        (parent && (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent))) ||
        (parent &&
          ts.isJsxAttribute(parent) &&
          /^(className|class|id|href|key|name|value|data-[\w-]+)$/.test(parent.name.getText(sf)));
      // "pending | confirmed | cancelled": a list of API values, not prose; sql`…` is a query.
      const values = /\w \| \w/.test(text) || inTaggedTemplate(n);
      const m = !code && !values && /\s/.test(text) ? BRITISH.exec(text) : null;
      if (m) found.push(`${path.relative(ROOT, file)}: "${m[0]}" in ${text.slice(0, 80)}`);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return found;
}

function proseInMarkdown(file: string): string[] {
  let fenced = false;
  const found: string[] = [];
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (/^\s*```/.test(line)) fenced = !fenced;
    if (fenced) continue;
    const prose = line.replace(/`[^`]*`|\]\([^)]*\)/g, "");
    const m = BRITISH.exec(prose);
    if (m) found.push(`${path.relative(ROOT, file)}: "${m[0]}" in ${line.slice(0, 80)}`);
  }
  return found;
}

describe("US English", () => {
  it("in the interface, emails and plans", () => {
    const files = sources
      .flatMap((g) => globSync(g, { cwd: ROOT }))
      .filter((f) => !/__tests__|\.test\.|\/console\//.test(f))
      .map((f) => path.join(ROOT, f));
    expect(files.length).toBeGreaterThan(100);
    expect(files.flatMap(proseIn)).toEqual([]);
  });

  it("in the docs", () => {
    const files = globSync("docs/*.md", { cwd: ROOT }).map((f) => path.join(ROOT, f));
    expect(files.flatMap(proseInMarkdown)).toEqual([]);
  });
});
