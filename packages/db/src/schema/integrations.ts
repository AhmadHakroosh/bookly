import {
  index,
  integer,
  jsonb,
  pgEnum,
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

/**
 * OAuth providers a host can connect. Google = Calendar + Meet, Microsoft = Outlook + Teams,
 * Zoom = meetings only. Daily.co (Bookly video) is configured by env, not per user.
 */
export const integrationProvider = pgEnum("integration_provider", ["google", "microsoft", "zoom"]);

export type IntegrationCalendar = { id: string; name: string; primary?: boolean };
/** A push channel on one calendar (Google watch channel or Graph subscription). */
export type WatchChannel = {
  calendarId: string;
  /** Google channel id / Microsoft subscription id. */
  id: string;
  /** Google only: the resource the channel watches (needed to stop it). */
  resourceId?: string;
  /** Random secret echoed back in every notification. */
  secret: string;
  expiresAt: string;
};

export type IntegrationSettings = {
  /** Calendars whose busy time blocks availability. */
  conflictCalendarIds?: string[];
  /** Calendar new bookings are written to. */
  destinationCalendarId?: string | null;
};

export const integrations = pgTable(
  "integrations",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: integrationProvider("provider").notNull(),
    /** Email / account name shown in the admin. */
    accountLabel: text("account_label"),
    externalAccountId: text("external_account_id"),
    scope: text("scope"),
    /** AES-GCM encrypted (see apps/web/src/lib/crypto.ts). */
    accessToken: text("access_token").notNull(),
    refreshToken: text("refresh_token"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    calendars: jsonb("calendars").$type<IntegrationCalendar[]>().notNull().default([]),
    settings: jsonb("settings").$type<IntegrationSettings>().notNull().default({}),
    /** Push notification channels so busy time refreshes when the calendar changes. */
    watch: jsonb("watch").$type<WatchChannel[]>().notNull().default([]),
    status: text("status").notNull().default("ok"), // ok | error
    lastError: text("last_error"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("integrations_user_provider_idx").on(t.userId, t.provider),
    index("integrations_ws_idx").on(t.workspaceId),
  ],
);

export type Integration = typeof integrations.$inferSelect;
export type IntegrationProvider = (typeof integrationProvider.enumValues)[number];

/** A busy block from a subscribed feed, as ISO instants (`s` start, `e` end). */
export type FeedBusy = { s: string; e: string };

/**
 * Read-only calendar subscriptions by URL (the "secret address" of a Google calendar, a
 * published Outlook calendar, a shared iCloud or Fastmail calendar). Bookly fetches the feed
 * on a schedule, keeps the busy blocks for the booking window, and subtracts them from the
 * host's availability. Nothing is written back; invites still go out by email.
 */
export const calendarFeeds = pgTable(
  "calendar_feeds",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Shown in the admin; defaults to the feed's X-WR-CALNAME or its host. */
    label: text("label").notNull(),
    /** AES-GCM encrypted: a private feed URL grants read access to the whole calendar. */
    url: text("url").notNull(),
    busy: jsonb("busy").$type<FeedBusy[]>().notNull().default([]),
    eventCount: integer("event_count").notNull().default(0),
    status: text("status").notNull().default("ok"), // ok | error
    lastError: text("last_error"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("calendar_feeds_user_idx").on(t.userId),
    index("calendar_feeds_ws_idx").on(t.workspaceId),
  ],
);

export type CalendarFeed = typeof calendarFeeds.$inferSelect;
