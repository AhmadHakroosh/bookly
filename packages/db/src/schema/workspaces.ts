import { boolean, index, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { organizations } from "./auth";

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

/** Per-workspace settings stored as JSON; validated in the app before writes. */
export type WorkspaceSettings = {
  branding?: { logoUrl?: string | null; accent?: string; colorMode?: "system" | "light" | "dark" };
  /** Default timezone for new schedules and for the booking page when the visitor's is unknown. */
  timezone?: string;
  /** Booking page footer / privacy text. */
  footerText?: string;
  /** Daily.co webhook registered for join notifications. */
  daily?: { webhookId?: string; hmac?: string; url?: string } | null;
  [key: string]: unknown;
};

/**
 * A workspace is one scheduling tenant (a person or a team). Every scheduling table
 * references `workspace_id`. Ownership, members and invitations are handled by the auth
 * `organizations` tables; a workspace belongs to exactly one organization.
 */
export const workspaces = pgTable(
  "workspaces",
  {
    id: id(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    locale: text("locale").notNull().default("en"),
    timezone: text("timezone").notNull().default("UTC"),
    settings: jsonb("settings").$type<WorkspaceSettings>().notNull().default({}),
    plan: text("plan").notNull().default("self-hosted"),
    suspendedAt: timestamp("suspended_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("workspaces_slug_idx").on(t.slug),
    index("workspaces_org_idx").on(t.organizationId),
  ],
);

/** Hostnames that resolve to a workspace: `<slug>.<root>` subdomains and custom domains. */
export const workspaceDomains = pgTable(
  "workspace_domains",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    host: text("host").notNull(),
    isPrimary: boolean("is_primary").notNull().default(false),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    /** DNS TXT value the owner must publish at _bookly.<host> before a custom domain is served. */
    verificationToken: text("verification_token"),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    lastError: text("last_error"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("workspace_domains_host_idx").on(t.host),
    index("workspace_domains_ws_idx").on(t.workspaceId),
  ],
);

export type Workspace = typeof workspaces.$inferSelect;
export type WorkspaceDomain = typeof workspaceDomains.$inferSelect;
