import { index, jsonb, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { workspaces } from "./workspaces";

/*
 * Clients and Hiring as two solutions (ADR 0009). A workspace runs one or both; members enter a
 * solution through their role (owners and admins: every enabled one) or a `solution_access` row.
 * Records that live in one solution carry a `solution` column set from the route or the parent
 * record, never from client state.
 */

export const SOLUTIONS = ["clients", "hiring"] as const;
export type Solution = (typeof SOLUTIONS)[number];

/** Per-solution settings; client settings still live in `workspaces.settings` until 1.1. */
export type SolutionSettings = Record<string, unknown>;

/** Which solutions a workspace runs, since when, and whether their first run is done. */
export const workspaceSolutions = pgTable(
  "workspace_solutions",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    solution: text("solution").$type<Solution>().notNull(),
    enabledAt: timestamp("enabled_at", { withTimezone: true }).notNull().defaultNow(),
    enabledBy: text("enabled_by").references(() => users.id, { onDelete: "set null" }),
    /** Null while enabled. Turning a solution off never deletes data; on again clears it. */
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
    /** First-run setup of this solution finished (or skipped). */
    setupCompletedAt: timestamp("setup_completed_at", { withTimezone: true }),
    settings: jsonb("settings").$type<SolutionSettings>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.solution] })],
);

export type WorkspaceSolution = typeof workspaceSolutions.$inferSelect;

/**
 * A member's way into a solution beyond their role: owners and admins need no row; members need
 * one per solution; collaborators only ever get `hiring`. The only store of solution access.
 */
export const solutionAccess = pgTable(
  "solution_access",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    solution: text("solution").$type<Solution>().notNull(),
    grantedBy: text("granted_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.userId, t.solution] }),
    index("solution_access_user_idx").on(t.workspaceId, t.userId),
  ],
);
