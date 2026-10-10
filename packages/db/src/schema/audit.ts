import { index, jsonb, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
import { workspaces } from "./workspaces";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

/* ---------------- Workspace audit log ---------------- */

export type AuditActorType = "user" | "guest" | "api_key" | "integration" | "system";

/** What changed, field by field: `{ name: { from: "Old", to: "New" } }`. */
export type AuditChanges = Record<string, { from?: unknown; to?: unknown }>;

/**
 * Everything anyone does to a workspace's data, so "who cancelled this?" always has an answer.
 * `workspaceId` is deliberately not a foreign key: the log outlives a deleted workspace for its
 * retention window, then the retention sweep removes it.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: id(),
    workspaceId: text("workspace_id").notNull(),
    actorType: text("actor_type").$type<AuditActorType>().notNull(),
    /** User id, guest email, API key id, integration id, or the job name. */
    actorId: text("actor_id"),
    /** Snapshot of how the actor was known at the time (email, key prefix, job name). */
    actorLabel: text("actor_label").notNull(),
    /** `booking.cancelled`, `settings.general.updated`, `member.role_changed`, … */
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id"),
    /** Snapshot of the target's name at the time, so a deleted target still reads well. */
    targetLabel: text("target_label"),
    changes: jsonb("changes").$type<AuditChanges>().notNull().default({}),
    requestId: text("request_id"),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Keyset pagination: newest first within a workspace.
    index("audit_log_ws_created_idx").on(t.workspaceId, t.createdAt, t.id),
    index("audit_log_ws_target_idx").on(t.workspaceId, t.targetType, t.targetId),
    index("audit_log_ws_actor_idx").on(t.workspaceId, t.actorType, t.actorId),
  ],
);

/* ---------------- Feature flags and beta cohorts ---------------- */

/** off: nobody; beta: cohorts and explicit grants; on: everyone (unless explicitly denied). */
export type FlagState = "off" | "beta" | "on";

/** One row per flag key the code knows about; the console sets its state. */
export const featureFlags = pgTable("feature_flags", {
  key: text("key").primaryKey(),
  description: text("description").notNull().default(""),
  state: text("state").$type<FlagState>().notNull().default("off"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

/** A named group of workspaces ("design partners", "EU clinics") a flag can be opened to. */
export const betaCohorts = pgTable("beta_cohorts", {
  id: id(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const cohortWorkspaces = pgTable(
  "cohort_workspaces",
  {
    cohortId: text("cohort_id")
      .notNull()
      .references(() => betaCohorts.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.cohortId, t.workspaceId] }),
    index("cohort_workspaces_ws_idx").on(t.workspaceId),
  ],
);

/** Which cohorts a flag in `beta` state is open to. */
export const flagCohorts = pgTable(
  "flag_cohorts",
  {
    flagKey: text("flag_key")
      .notNull()
      .references(() => featureFlags.key, { onDelete: "cascade" }),
    cohortId: text("cohort_id")
      .notNull()
      .references(() => betaCohorts.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.flagKey, t.cohortId] })],
);

/** An explicit per-workspace grant or denial, which beats cohorts and the flag's state. */
export const workspaceFlags = pgTable(
  "workspace_flags",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    flagKey: text("flag_key")
      .notNull()
      .references(() => featureFlags.key, { onDelete: "cascade" }),
    mode: text("mode").$type<"grant" | "deny">().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    note: text("note"),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.flagKey] })],
);

export type AuditEntry = typeof auditLog.$inferSelect;
export type FeatureFlag = typeof featureFlags.$inferSelect;
export type BetaCohort = typeof betaCohorts.$inferSelect;
export type WorkspaceFlag = typeof workspaceFlags.$inferSelect;
