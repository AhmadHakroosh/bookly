import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
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
