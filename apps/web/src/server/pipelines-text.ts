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
    if (!/^#[0-9a-f]{6}$/i.test(s.color)) problems.push(`"${s.color}" is not a colour.`);
  }
  const entries = stages.filter((s) => s.isEntry).length;
  if (entries !== 1) problems.push("Exactly one stage must be where new people start.");
  if (!stages.some((s) => s.category === "open"))
    problems.push("A pipeline needs at least one open stage.");
  return problems;
}
