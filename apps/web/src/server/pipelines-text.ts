import {
  STAGE_CATEGORIES,
  type ContactStage,
  type StageCategory,
  type StageModules,
  type StageSettings,
} from "@bookly/db/schema";

/**
 * Pipelines without the database (ADR 0001): the built-in templates, the mapping from a stage
 * to the legacy `contacts.stage` value written through 1.0.x, and the rules a stage list must
 * keep. Code reads a stage's category, settings and key, never its name.
 */

export type StageTemplate = {
  key: string;
  name: string;
  category: StageCategory;
  color: string;
  isEntry?: boolean;
  settings?: StageSettings;
  modules?: StageModules;
};

/**
 * The default client pipeline, seeded from the four stages contacts had before pipelines.
 * Keep in step with the backfill in packages/db/drizzle/0038_pipelines.sql.
 */
export const CLIENT_PIPELINE: { name: string; template: string; stages: StageTemplate[] } = {
  name: "Clients",
  template: "clients",
  stages: [
    { key: "lead", name: "Lead", category: "open", color: "#71717a", isEntry: true },
    {
      key: "active",
      name: "Active",
      category: "open",
      color: "#2563eb",
      settings: { priorityScheduling: true },
    },
    {
      key: "won",
      name: "Won",
      category: "won",
      color: "#16a34a",
      settings: { priorityScheduling: true },
    },
    { key: "lost", name: "Lost", category: "lost", color: "#dc2626" },
  ],
};

/**
 * The legacy value a contact's `stage` column gets when it moves to this stage. The four
 * default keys map to themselves; a customer's own stage maps by category, and an open stage
 * with priority scheduling counts as "active" so priority keeps working for old readers.
 */
export function legacyStageFor(stage: {
  key: string;
  category: StageCategory;
  settings?: StageSettings | null;
}): ContactStage {
  if (stage.key === "lead" || stage.key === "active" || stage.key === "won" || stage.key === "lost")
    return stage.key;
  if (stage.category === "won") return "won";
  if (stage.category === "lost") return "lost";
  return stage.settings?.priorityScheduling ? "active" : "lead";
}

/** A stage key: lowercase letters, digits and single dashes or underscores, 1–40 chars. */
export const isStageKey = (key: string) => /^[a-z0-9](?:[a-z0-9_-]{0,38}[a-z0-9])?$/.test(key);

/** Turns a stage name into a key unique among `taken` ("In review" → "in-review", then "in-review-2"). */
export function stageKeyFor(name: string, taken: Iterable<string> = []): string {
  const used = new Set(taken);
  const base =
    name
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 36) || "stage";
  if (!used.has(base)) return base;
  for (let i = 2; ; i++) if (!used.has(`${base}-${i}`)) return `${base}-${i}`;
}

/**
 * The problems with a pipeline's live stages, empty when it is valid: unique keys, a known
 * category, a colour, exactly one entry stage and at least one open stage.
 */
export function stageProblems(
  stages: Pick<StageTemplate, "key" | "name" | "category" | "color" | "isEntry">[],
): string[] {
  const problems: string[] = [];
  if (!stages.length) return ["A pipeline needs at least one stage."];
  const keys = new Set<string>();
  for (const s of stages) {
    if (!isStageKey(s.key)) problems.push(`"${s.key}" is not a valid stage key.`);
    else if (keys.has(s.key)) problems.push(`The stage key "${s.key}" is used twice.`);
    keys.add(s.key);
    if (!s.name.trim()) problems.push("Every stage needs a name.");
    if (!(STAGE_CATEGORIES as readonly string[]).includes(s.category))
      problems.push(`"${s.category}" is not a stage category.`);
    if (!/^#[0-9a-f]{6}$/i.test(s.color)) problems.push(`"${s.color}" is not a color.`);
  }
  const entries = stages.filter((s) => s.isEntry).length;
  if (entries !== 1) problems.push("Exactly one stage must be where new people start.");
  if (!stages.some((s) => s.category === "open"))
    problems.push("A pipeline needs at least one open stage.");
  return problems;
}

/* ---------------- Editing (Settings → Pipeline) ---------------- */

/** A new stage's colour by category, so a stage is recognisable before anyone picks one. */
export const STAGE_COLOR: Record<StageCategory, string> = {
  open: "#71717a",
  hold: "#ca8a04",
  won: "#16a34a",
  lost: "#dc2626",
};

type Live = Pick<StageTemplate, "key" | "name" | "category" | "color" | "isEntry"> & { id: string };

/** The problems with the pipeline after editing one stage (empty = fine). */
export function editProblems(
  stages: Live[],
  id: string,
  patch: Partial<Pick<Live, "name" | "category" | "color" | "isEntry">>,
): string[] {
  const next = stages.map((s) =>
    s.id === id ? { ...s, ...patch } : patch.isEntry ? { ...s, isEntry: false } : s,
  );
  return stageProblems(next);
}

/**
 * Why a stage cannot be archived, or null. A stage with people in it needs somewhere to move
 * them; the pipeline must keep an entry stage and an open stage.
 */
export function archiveProblem(
  stages: Live[],
  id: string,
  inStage: number,
  moveTo: string | null,
): string | null {
  const s = stages.find((x) => x.id === id);
  if (!s) return "That stage no longer exists.";
  if (s.isEntry) return "Choose another stage where new people start first.";
  const rest = stages.filter((x) => x.id !== id);
  if (!rest.some((x) => x.category === "open")) return "A pipeline needs at least one open stage.";
  if (inStage > 0 && (!moveTo || moveTo === id || !rest.some((x) => x.id === moveTo)))
    return `Move the ${inStage} ${inStage === 1 ? "person" : "people"} in this stage somewhere first.`;
  return null;
}

/** The neighbour a stage swaps places with when moved up or down, or null at the end. */
export function swapTarget<T extends { id: string }>(stages: T[], id: string, dir: "up" | "down") {
  const i = stages.findIndex((s) => s.id === id);
  const j = dir === "up" ? i - 1 : i + 1;
  return i < 0 || j < 0 || j >= stages.length ? null : stages[j]!;
}

/**
 * The stage a key names, for callers that still speak the classic values (the recap's and
 * capture's suggestions, the first completed meeting): its own stage while it lives, else the
 * first live stage of its kind, so "won" still lands after Won was archived. `lead` is the
 * entry stage, `active` the first open stage after it.
 */
export function stageForKey<T extends { key: string; category: StageCategory; isEntry: boolean }>(
  stages: T[],
  key: string,
): T | undefined {
  const own = stages.find((s) => s.key === key);
  if (own) return own;
  const entry = stages.find((s) => s.isEntry) ?? stages[0];
  if (key === "lead") return entry;
  if (key === "active") return stages.find((s) => s.category === "open" && s !== entry) ?? entry;
  if (key === "won" || key === "lost") return stages.find((s) => s.category === key);
  return undefined;
}
