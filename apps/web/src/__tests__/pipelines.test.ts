import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  archiveProblem,
  CLIENT_PIPELINE,
  editProblems,
  isStageKey,
  legacyStageFor,
  stageForKey,
  stageKeyFor,
  stageProblems,
  swapTarget,
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

  it("rejects duplicate keys, empty names, unknown categories and bad colors", () => {
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
      '"orange" is not a color.',
    ]);
  });

  it("refuses an empty pipeline", () => {
    expect(stageProblems([])).toEqual(["A pipeline needs at least one stage."]);
  });
});

describe("editing the pipeline", () => {
  const stages = CLIENT_PIPELINE.stages.map((s) => ({ ...s, id: s.key, isEntry: !!s.isEntry }));

  it("keeps exactly one entry stage when another becomes the entry", () => {
    expect(editProblems(stages, "active", { isEntry: true })).toEqual([]);
    expect(editProblems(stages, "lead", { isEntry: false })).toContain(
      "Exactly one stage must be where new people start.",
    );
  });

  it("refuses an edit that leaves no open stage", () => {
    const twoOpen = editProblems(stages, "lead", { category: "won" });
    expect(twoOpen).toEqual([]);
    const oneOpen = stages.filter((s) => s.key !== "active");
    expect(editProblems(oneOpen, "lead", { category: "won" })).toContain(
      "A pipeline needs at least one open stage.",
    );
  });

  it("archives only an empty stage, or one whose people have somewhere to go", () => {
    expect(archiveProblem(stages, "lost", 0, null)).toBeNull();
    expect(archiveProblem(stages, "lost", 3, null)).toBe(
      "Move the 3 people in this stage somewhere first.",
    );
    expect(archiveProblem(stages, "lost", 1, "lost")).toBe(
      "Move the 1 person in this stage somewhere first.",
    );
    expect(archiveProblem(stages, "lost", 3, "won")).toBeNull();
    expect(archiveProblem(stages, "lead", 0, null)).toBe(
      "Choose another stage where new people start first.",
    );
  });

  it("swaps with the neighbour, and stops at the ends", () => {
    expect(swapTarget(stages, "active", "up")?.id).toBe("lead");
    expect(swapTarget(stages, "active", "down")?.id).toBe("won");
    expect(swapTarget(stages, "lead", "up")).toBeNull();
    expect(swapTarget(stages, "lost", "down")).toBeNull();
  });

  it("lands classic values on a live stage of the same kind once their own is archived", () => {
    expect(stageForKey(stages, "won")?.key).toBe("won");
    const custom = [
      { key: "new", category: "open" as const, isEntry: true },
      { key: "proposal-sent", category: "open" as const, isEntry: false },
      { key: "signed", category: "won" as const, isEntry: false },
      { key: "gone", category: "lost" as const, isEntry: false },
    ];
    expect(stageForKey(custom, "lead")?.key).toBe("new");
    expect(stageForKey(custom, "active")?.key).toBe("proposal-sent");
    expect(stageForKey(custom, "won")?.key).toBe("signed");
    expect(stageForKey(custom, "lost")?.key).toBe("gone");
    expect(stageForKey(custom.slice(0, 1), "active")?.key).toBe("new");
    expect(stageForKey(custom.slice(0, 2), "won")).toBeUndefined();
    expect(stageForKey(custom, "no-such-stage")).toBeUndefined();
  });
});

describe("priority scheduling", () => {
  it("follows the stage's setting, and the legacy value without a stage", async () => {
    process.env.AUTH_SECRET ??= "test-secret-test-secret-test";
    process.env.DATABASE_URL ??= "postgres://x:y@localhost:5432/z";
    process.env.APP_URL ??= "http://localhost:3002";
    const { isPriorityContact } = await import("@/server/contacts");
    const lead = { stage: "lead" as const, tags: [] };
    expect(isPriorityContact(lead, { settings: { priorityScheduling: true } })).toBe(true);
    expect(isPriorityContact({ ...lead, stage: "won" }, { settings: {} })).toBe(false);
    expect(isPriorityContact({ ...lead, stage: "active" }, null)).toBe(true);
    expect(isPriorityContact(lead, null)).toBe(false);
    expect(isPriorityContact({ ...lead, tags: ["VIP"] }, { settings: {} })).toBe(true);
    expect(isPriorityContact(null)).toBe(false);
  });
});
