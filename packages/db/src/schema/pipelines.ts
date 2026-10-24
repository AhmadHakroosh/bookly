import { sql } from "drizzle-orm";
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { users } from "./auth";
import { workspaces } from "./workspaces";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());
const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

/* ---------------- Pipelines (ADR 0001) ---------------- */

/** A workspace has one client pipeline; hiring (Phase 5) gets one per opportunity. */
export type PipelineKind = "client" | "hiring";
/** Reports and rules read the category, never the name. */
export const STAGE_CATEGORIES = ["open", "hold", "won", "lost"] as const;
export type StageCategory = (typeof STAGE_CATEGORIES)[number];

/** Behaviour a stage turns on that is not a module. */
export type StageSettings = {
  /** People in this stage get priority scheduling (bypass focus blocks and weekly budgets). */
  priorityScheduling?: boolean;
  /** Board column warns above this many items, like task_statuses.wip_limit. */
  wipLimit?: number | null;
  /** "Needs attention" after this many days in the stage. */
  attentionAfterDays?: number | null;
};

/** Stage modules and their configuration; typed by the module registry (ADR 0002). */
export type StageModules = Record<string, unknown>;

export const pipelines = pgTable(
  "pipelines",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    kind: text("kind").$type<PipelineKind>().notNull(),
    name: text("name").notNull(),
    /** The built-in template it was copied from ("clients", "fellowship"…), for analytics and resets. */
    template: text("template"),
    /** A workspace template: listed in "start from", never holds anyone. */
    isTemplate: boolean("is_template").notNull().default(false),
    /** The workspace's client pipeline (exactly one per workspace). */
    isDefault: boolean("is_default").notNull().default(false),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("pipelines_ws_kind_idx").on(t.workspaceId, t.kind),
    uniqueIndex("pipelines_ws_default_client_idx")
      .on(t.workspaceId)
      .where(sql`${t.isDefault} and ${t.kind} = 'client'`),
  ],
);

export const pipelineStages = pgTable(
  "pipeline_stages",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    pipelineId: text("pipeline_id")
      .notNull()
      .references(() => pipelines.id, { onDelete: "cascade" }),
    /** Stable machine key, unique in the pipeline; survives renames. API, rules and the legacy mapping use it. */
    key: text("key").notNull(),
    name: text("name").notNull(),
    category: text("category").$type<StageCategory>().notNull().default("open"),
    /** Fractional, like tasks.position: a reorder rewrites one row. */
    position: doublePrecision("position").notNull().default(0),
    /** `#rrggbb`. */
    color: text("color").notNull().default("#71717a"),
    /** Where new items land. Exactly one live entry stage per pipeline. */
    isEntry: boolean("is_entry").notNull().default(false),
    settings: jsonb("settings").$type<StageSettings>().notNull().default({}),
    modules: jsonb("modules").$type<StageModules>().notNull().default({}),
    /** Archived stages keep their history; items are moved out first. */
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("pipeline_stages_pipeline_idx").on(t.pipelineId, t.position),
    index("pipeline_stages_ws_idx").on(t.workspaceId),
    uniqueIndex("pipeline_stages_key_idx")
      .on(t.pipelineId, t.key)
      .where(sql`${t.archivedAt} is null`),
    uniqueIndex("pipeline_stages_entry_idx")
      .on(t.pipelineId)
      .where(sql`${t.isEntry} and ${t.archivedAt} is null`),
  ],
);

/**
 * Append-only history of every stage change: time-in-stage and conversion reports, and the
 * trigger record for stage rules (ADR 0002). The subject is a contact (client pipeline) or an
 * application (hiring); its id has no FK because it is polymorphic.
 */
export const stageTransitions = pgTable(
  "stage_transitions",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    pipelineId: text("pipeline_id")
      .notNull()
      .references(() => pipelines.id, { onDelete: "cascade" }),
    subjectType: text("subject_type").$type<"contact" | "application">().notNull(),
    subjectId: text("subject_id").notNull(),
    /** null when the subject entered the pipeline. */
    fromStageId: text("from_stage_id").references(() => pipelineStages.id, {
      onDelete: "set null",
    }),
    toStageId: text("to_stage_id").references(() => pipelineStages.id, { onDelete: "set null" }),
    /** Who moved it: "user", "system", "api", "capture", "recap", "rule". */
    actorType: text("actor_type").notNull(),
    actorId: text("actor_id"),
    /** How many rule-driven moves led here (ADR 0002 loop guard). */
    depth: integer("depth").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("stage_transitions_subject_idx").on(t.subjectType, t.subjectId, t.createdAt),
    index("stage_transitions_ws_to_idx").on(t.workspaceId, t.toStageId, t.createdAt),
  ],
);

export type Pipeline = typeof pipelines.$inferSelect;
export type PipelineStage = typeof pipelineStages.$inferSelect;
export type StageTransition = typeof stageTransitions.$inferSelect;
