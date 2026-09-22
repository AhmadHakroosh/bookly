import {
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { workspaces } from "./workspaces";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

export const API_SCOPES = ["bookings:read", "bookings:write"] as const;
export type ApiScope = (typeof API_SCOPES)[number];

/** API keys are shown once; only a SHA-256 hash is stored. `prefix` helps identify keys in lists. */
export const apiKeys = pgTable(
  "api_keys",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    prefix: text("prefix").notNull(),
    keyHash: text("key_hash").notNull(),
    scopes: jsonb("scopes").$type<ApiScope[]>().notNull().default([]),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("api_keys_hash_idx").on(t.keyHash),
    index("api_keys_ws_idx").on(t.workspaceId),
  ],
);

/* ---------------- Operations: audit, usage, health ---------------- */

/** Every operator action in the console, for accountability. */
export const operatorAuditLog = pgTable(
  "operator_audit_log",
  {
    id: id(),
    actorEmail: text("actor_email").notNull(),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(), // workspace | user | platform
    targetId: text("target_id"),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("operator_audit_created_idx").on(t.createdAt),
    index("operator_audit_target_idx").on(t.targetType, t.targetId),
  ],
);

/** Per-workspace, per-day counters (api requests, emails, …) kept cheaply with upserts. */
export const usageCounters = pgTable(
  "usage_counters",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    /** YYYY-MM-DD (UTC). */
    day: text("day").notNull(),
    metric: text("metric").notNull(),
    n: integer("n").notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.day, t.metric] }),
    index("usage_counters_ws_idx").on(t.workspaceId, t.day),
  ],
);

/** Small key/value state for health checks (last job tick, last webhook, …). */
/** Self-hosted installs that phone in through the update check (cloud/platform side). */
export const installs = pgTable("installs", {
  id: text("id").primaryKey(),
  version: text("version").notNull(),
  tenancy: text("tenancy").notNull(),
  nodeVersion: text("node_version"),
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  pings: integer("pings").notNull().default(1),
  /** Opt-in usage counts, null when the install does not share them. */
  stats: jsonb("stats").$type<Record<string, unknown>>(),
});

export const platformState = pgTable("platform_state", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<Record<string, unknown>>().notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const WEBHOOK_EVENTS = [
  "booking.created",
  "booking.confirmed",
  "booking.cancelled",
  "booking.rescheduled",
  "contact.created",
  "contact.stage_changed",
  "meeting.captured",
  "task.created",
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export const webhooks = pgTable(
  "webhooks",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    /** HMAC-SHA256 signing secret, shown once. */
    secret: text("secret").notNull(),
    events: jsonb("events").$type<WebhookEvent[]>().notNull().default([]),
    active: integer("active").notNull().default(1),
    description: text("description"),
    lastStatus: integer("last_status"),
    lastDeliveredAt: timestamp("last_delivered_at", { withTimezone: true }),
    failures: integer("failures").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("webhooks_ws_idx").on(t.workspaceId)],
);

export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    id: id(),
    webhookId: text("webhook_id")
      .notNull()
      .references(() => webhooks.id, { onDelete: "cascade" }),
    event: text("event").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: text("status").notNull().default("pending"), // pending | delivered | failed
    attempts: integer("attempts").notNull().default(0),
    responseStatus: integer("response_status"),
    responseBody: text("response_body"),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("webhook_deliveries_hook_idx").on(t.webhookId, t.createdAt),
    index("webhook_deliveries_retry_idx").on(t.status, t.nextAttemptAt),
  ],
);

export type ApiKey = typeof apiKeys.$inferSelect;
export type Webhook = typeof webhooks.$inferSelect;
export type WebhookDelivery = typeof webhookDeliveries.$inferSelect;
