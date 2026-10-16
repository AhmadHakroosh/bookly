import { sql } from "drizzle-orm";
import { index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { workspaces } from "./workspaces";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

/**
 * What a notification is about. The list grows with the product (messages arrive with item 7);
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
  | "task.overdue";

/**
 * One notification for one member of one workspace: the bell, the panel and the Home card read
 * these; the live stream and Web Push announce them. `dedupeKey` makes a retried job a no-op.
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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("notifications_user_created_idx").on(t.userId, t.workspaceId, t.createdAt, t.id),
    index("notifications_unread_idx")
      .on(t.userId, t.workspaceId)
      .where(sql`${t.readAt} is null`),
    uniqueIndex("notifications_dedupe_idx").on(t.userId, t.dedupeKey),
    index("notifications_created_idx").on(t.createdAt),
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
