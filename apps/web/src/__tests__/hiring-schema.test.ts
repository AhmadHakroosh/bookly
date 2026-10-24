import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getTableColumns, getTableName, schema } from "@bookly/db";
import { clamavScanner, parseClamReply, scanFile, setScanner } from "@bookly/storage";
import {
  closeGraceMinutes,
  defaultRetentionDays,
  deleteAfter,
  retentionDays,
  retentionWarning,
} from "@/server/hiring/hiring-text";

/*
 * The hiring schema (ADR 0003, slice S8) and the rules that keep it honest: retention defaults by
 * type, the scan hook, and guards that fail the build when sensitive data or hiring tables are
 * used outside their modules, or anything sorts people by their ratings (canon X1).
 */

process.env.AUTH_SECRET ??= "test-secret-test-secret-test";
process.env.DATABASE_URL ??= "postgres://x:y@localhost:5432/z";
process.env.APP_URL ??= "http://localhost:3002";

const ROOT = path.join(__dirname, "..");
const REPO = path.join(ROOT, "../../..");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) return f === "__tests__" || f === "node_modules" ? [] : walk(p);
    return /\.(ts|tsx)$/.test(f) ? [p] : [];
  });
}
const sources = walk(ROOT).map((f) => ({
  rel: path.relative(ROOT, f),
  src: readFileSync(f, "utf8"),
}));
const using = (pattern: RegExp) => sources.filter((s) => pattern.test(s.src)).map((s) => s.rel);

describe("retention", () => {
  it("keeps job and internship records a year, everything else about six months", () => {
    expect(defaultRetentionDays("job")).toBe(365);
    expect(defaultRetentionDays("internship")).toBe(365);
    for (const t of ["cohort", "fellowship", "program", "admissions", "grant", "custom"] as const)
      expect(defaultRetentionDays(t)).toBe(183);
  });

  it("uses the setting within 30 to 730 days", () => {
    expect(retentionDays("cohort", {})).toBe(183);
    expect(retentionDays("cohort", { retentionDays: 90 })).toBe(90);
    expect(retentionDays("cohort", { retentionDays: 5 })).toBe(30);
    expect(retentionDays("job", { retentionDays: 9999 })).toBe(730);
  });

  it("warns below a year for employment records only", () => {
    expect(retentionWarning("job", 200)).toMatch(/a year/);
    expect(retentionWarning("job", 365)).toBeNull();
    expect(retentionWarning("fellowship", 60)).toBeNull();
  });

  it("gives late drafts two hours by default, at most a day", () => {
    expect(closeGraceMinutes({})).toBe(120);
    expect(closeGraceMinutes({ closeGraceMinutes: 5000 })).toBe(1440);
    expect(closeGraceMinutes({ closeGraceMinutes: -3 })).toBe(0);
    expect(deleteAfter(new Date("2027-01-01T00:00:00Z"), 183).toISOString()).toBe(
      "2027-07-03T00:00:00.000Z",
    );
  });
});

describe("the scan hook", () => {
  it("reads clamd's replies", () => {
    expect(parseClamReply("stream: OK\0")).toBe("clean");
    expect(parseClamReply("stream: Eicar-Test-Signature FOUND\0")).toBe("infected");
    expect(() => parseClamReply("INSTREAM size limit exceeded. ERROR")).toThrow();
  });

  it("leaves files pending without a scanner, or when the scanner fails", async () => {
    const file = { bytes: new Uint8Array([1, 2, 3]), name: "cv.pdf", mime: "application/pdf" };
    setScanner(null);
    expect(await scanFile(file)).toBe("pending");
    setScanner(async () => {
      throw new Error("down");
    });
    expect(await scanFile(file)).toBe("pending");
    setScanner(async () => "clean");
    expect(await scanFile(file)).toBe("clean");
    setScanner(null);
  });

  it("never calls a file clean when clamd cannot be reached", async () => {
    setScanner(clamavScanner("127.0.0.1", 1, 500));
    expect(await scanFile({ bytes: new Uint8Array([1]), name: "a.txt", mime: "text/plain" })).toBe(
      "pending",
    );
    setScanner(null);
  });
});

describe("hiring schema", () => {
  const hiringTables = [
    schema.opportunities,
    schema.opportunityCohorts,
    schema.applications,
    schema.applicationSensitive,
    schema.scorecards,
    schema.reviewAssignments,
    schema.reviews,
    schema.decisions,
    schema.decisionBatches,
    schema.dataRequests,
    schema.opportunityMembers,
    schema.applicationAccess,
  ];

  it("scopes every table by workspace", () => {
    for (const t of hiringTables)
      expect(Object.keys(getTableColumns(t)), getTableName(t)).toContain("workspaceId");
  });

  it("has no column for an AI score, rank or recommendation about a person", () => {
    for (const t of hiringTables)
      for (const col of Object.keys(getTableColumns(t)))
        expect(col, `${getTableName(t)}.${col}`).not.toMatch(/^(ai|score|rank|ranking|aiScore)/i);
  });

  it("allows one waitlist per pipeline, on a hold stage only", () => {
    const sql = readFileSync(path.join(REPO, "packages/db/drizzle/0042_hiring.sql"), "utf8");
    expect(sql).toContain('CREATE UNIQUE INDEX "pipeline_stages_waitlist_idx"');
    expect(sql).toMatch(/is_waitlist" and "pipeline_stages"\."archived_at" is null/);
    expect(sql).toContain(
      `CHECK (not "pipeline_stages"."is_waitlist" or "pipeline_stages"."category" = 'hold')`,
    );
  });
});

describe("hiring guards", () => {
  it("reads and writes sensitive data only through server/hiring/sensitive.ts", () => {
    expect(using(/\bapplicationSensitive\b/)).toEqual(["server/hiring/sensitive.ts"]);
  });

  it("keeps applications, reviews and decisions inside the hiring, access and pipeline modules", () => {
    const allowed = /^server\/(hiring|access|pipelines)\//;
    const tables =
      /schema\.(applications|reviews|reviewAssignments|decisions|decisionBatches|applicationAccess|opportunityMembers|dataRequests)\b|formResponses\.applicationId/;
    expect(using(tables).filter((f) => !allowed.test(f))).toEqual([]);
  });

  it("never sorts or filters people by their ratings or recommendations", () => {
    const sorts =
      /orderBy\([^)]*\b(ratings|recommendation)\b|order by[^`]*\b(ratings|recommendation)\b/i;
    expect(using(sorts)).toEqual([]);
  });
});
