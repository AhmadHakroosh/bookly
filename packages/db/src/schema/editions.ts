import { index, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
import { workspaces } from "./workspaces";

/* ---------------- Commercial entitlements (ADR 0006) ---------------- */

/**
 * An operator grant of a commercial feature to one workspace on the hosted service (an
 * Enterprise contract on cloud). Only read under a `cloud` license; self-hosted installs take
 * their features from their own license key.
 */
export const workspaceEntitlements = pgTable(
  "workspace_entitlements",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    /** An `EeFeature` from @bookly/editions. */
    feature: text("feature").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    note: text("note"),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.feature] }),
    index("workspace_entitlements_ws_idx").on(t.workspaceId),
  ],
);

export type WorkspaceEntitlement = typeof workspaceEntitlements.$inferSelect;
