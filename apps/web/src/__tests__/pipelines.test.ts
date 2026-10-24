import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CLIENT_PIPELINE,
  isStageKey,
  legacyStageFor,
  stageKeyFor,
  stageProblems,
} from "@/server/pipelines-text";

describe("client pipeline template", () => {
  it("is a valid pipeline that starts in Lead", () => {
    expect(stageProblems(CLIENT_PIPELINE.stages)).toEqual([]);
    expect(CLIENT_PIPELINE.stages.find((s) => s.isEntry)?.key).toBe("lead");
  });

  it("keeps priority scheduling where it was: active and won", () => {
    const priority = CLIENT_PIPELINE.stages
      .filter((s) => s.settings?.priorityScheduling)
      .map((s) => s.key);
    expect(priority).toEqual(["active", "won"]);
  });

  it("matches the backfill in the 0038 migration", () => {
    const sql = readFileSync(
      path.join(__dirname, "../../../../packages/db/drizzle/0038_pipelines.sql"),
      "utf8",
    );
    for (const [i, s] of CLIENT_PIPELINE.stages.entries()) {
      const settings = JSON.stringify(s.settings ?? {});
      expect(sql).toContain(
        `('${s.key}', '${s.name}', '${s.category}', ${i + 1}, '${s.color}', ${!!s.isEntry}, '${settings}')`,
      );
    }
  });
});

describe("legacyStageFor", () => {
  const stage = (key: string, category: "open" | "hold" | "won" | "lost", priority = false) => ({
    key,
    category,
    settings: priority ? { priorityScheduling: true } : {},
  });

  it("maps the four default keys to themselves", () => {
    for (const key of ["lead", "active", "won", "lost"] as const)
      expect(legacyStageFor(stage(key, "open"))).toBe(key);
  });

  it("maps a workspace's own stage by category", () => {
    expect(legacyStageFor(stage("proposal", "open"))).toBe("lead");
    expect(legacyStageFor(stage("paused", "hold"))).toBe("lead");
    expect(legacyStageFor(stage("signed", "won"))).toBe("won");
    expect(legacyStageFor(stage("gone-quiet", "lost"))).toBe("lost");
  });

  it("keeps an open priority stage on the priority side for old readers", () => {
    expect(legacyStageFor(stage("retainer", "open", true))).toBe("active");
    expect(legacyStageFor(stage("on-hold-vip", "hold", true))).toBe("active");
  });
});

describe("stage keys", () => {
  it("accepts machine keys and rejects the rest", () => {
    for (const k of ["lead", "in-review", "round_2", "a"]) expect(isStageKey(k)).toBe(true);
    for (const k of ["", "In review", "-lead", "lead-", "ünicode", "x".repeat(41)])
      expect(isStageKey(k)).toBe(false);
  });

  it("derives a unique key from a name", () => {
    expect(stageKeyFor("In review")).toBe("in-review");
    expect(stageKeyFor("Décision finale")).toBe("decision-finale");
    expect(stageKeyFor("In review", ["in-review", "in-review-2"])).toBe("in-review-3");
    expect(stageKeyFor("!!!")).toBe("stage");
    expect(isStageKey(stageKeyFor("A very long stage name that keeps going and going"))).toBe(true);
  });
});

describe("stageProblems", () => {
  const ok = { key: "a", name: "A", category: "open" as const, color: "#71717a", isEntry: true };

  it("needs exactly one entry stage and one open stage", () => {
    expect(stageProblems([{ ...ok, isEntry: false }])).toContain(
      "Exactly one stage must be where new people start.",
    );
    expect(stageProblems([ok, { ...ok, key: "b" }])).toContain(
      "Exactly one stage must be where new people start.",
    );
    expect(stageProblems([{ ...ok, category: "won" }])).toContain(
      "A pipeline needs at least one open stage.",
    );
  });

  it("rejects duplicate keys, empty names, unknown categories and bad colours", () => {
    const problems = stageProblems([
      ok,
      { ...ok, isEntry: false },
      { ...ok, key: "c", isEntry: false, name: " " },
      { ...ok, key: "d", isEntry: false, category: "maybe" as never },
      { ...ok, key: "e", isEntry: false, color: "orange" },
    ]);
    expect(problems).toEqual([
      'The stage key "a" is used twice.',
      "Every stage needs a name.",
      '"maybe" is not a stage category.',
      '"orange" is not a colour.',
    ]);
  });

  it("refuses an empty pipeline", () => {
    expect(stageProblems([])).toEqual(["A pipeline needs at least one stage."]);
  });
});
