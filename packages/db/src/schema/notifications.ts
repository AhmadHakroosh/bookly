import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { workspaces } from "./workspaces";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

/**
 * What a notification is about. The list grows with the product (messages arrived with item 8);
 * labels, defaults and the text/Slack event each kind maps to live in the app's
 * `server/notifications.ts`.
 */
export type NotificationKind =
  | "booking.created"
  | "booking.requested"
  | "booking.cancelled"
  | "booking.reminder"
  | "guest.joined"
  | "recap.ready"
  | "payment.received"
  | "email.replied"
  | "task.assigned"
  | "task.mentioned"
  | "task.overdue"
  | "message.posted"
  | "message.mentioned"
  | "automation"
  | "hiring.team"
  | "application.submitted"
  | "account.photo_removed";

/** A channel `notify()` used for a notification, besides the bell (ADR 0007). */
export type DeliveryChannel = "socket" | "push" | "email" | "text";

/**
 * What `notify()` holds back while the member is connected, sent at `fallback_at` unless the
 * notification was seen or read by then (ADR 0007).
 */
export type NotificationFallback = {
  push?: boolean;
  email?: { subject: string; text: string; html?: string; replyTo?: string };
  text?: { event: string; text: string; bookingId?: string };
  /** Listed as read from the start (a desktop-only kind): only being seen cancels it. */
  seenOnly?: boolean;
};

/**
 * One notification for one member of one workspace: the bell, the panel and the Home card read
 * these; the live connection announces them, and the other channels are the fallback (ADR 0007).
 * `dedupeKey` makes a retried job a no-op.
 */
export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").$type<NotificationKind>().notNull(),
    title: text("title").notNull(),
    body: text("body"),
    /** Path inside the admin (`/admin/bookings?booking=…`), never an absolute URL. */
    link: text("link"),
    dedupeKey: text("dedupe_key"),
    readAt: timestamp("read_at", { withTimezone: true }),
    /** Shown in a visible tab, or as a desktop notification by a tab: cancels the fallback. */
    seenAt: timestamp("seen_at", { withTimezone: true }),
    /** When the held-back channels are due; null when nothing is pending. */
    fallbackAt: timestamp("fallback_at", { withTimezone: true }),
    fallback: jsonb("fallback").$type<NotificationFallback>(),
    /** When each channel was used. */
    delivery: jsonb("delivery")
      .$type<Partial<Record<DeliveryChannel, string>>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("notifications_user_created_idx").on(t.userId, t.workspaceId, t.createdAt, t.id),
    index("notifications_unread_idx")
      .on(t.userId, t.workspaceId)
      .where(sql`${t.readAt} is null`),
    uniqueIndex("notifications_dedupe_idx").on(t.userId, t.dedupeKey),
    index("notifications_created_idx").on(t.createdAt),
    index("notifications_fallback_idx")
      .on(t.fallbackAt)
      .where(sql`${t.fallbackAt} is not null`),
  ],
);

/** A browser that accepted Web Push for a member of a workspace (one row per endpoint). */
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    /** "Chrome on macOS", for the device list on the Notifications page. */
    device: text("device"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSentAt: timestamp("last_sent_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("push_subscriptions_endpoint_idx").on(t.endpoint),
    index("push_subscriptions_user_idx").on(t.userId, t.workspaceId),
  ],
);

export type Notification = typeof notifications.$inferSelect;
export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect;
