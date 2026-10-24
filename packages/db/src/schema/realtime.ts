import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { workspaces } from "./workspaces";

/**
 * Presence (ADR 0007): one row per open connection, a websocket or the Server-Sent Events
 * fallback. A member counts as connected while a row of theirs was seen in the last minute.
 * Socket servers write these (`@bookly/realtime/server`); `notify()` reads them.
 */
export const realtimeConnections = pgTable(
  "realtime_connections",
  {
    /** Made by the socket server; `sse:<tab id>` for the fallback stream. */
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    transport: text("transport").$type<"ws" | "sse">().notNull(),
    /** The server process holding it, so it can remove its rows when it stops. */
    node: text("node").notNull(),
    connectedAt: timestamp("connected_at", { withTimezone: true }).notNull().defaultNow(),
    seenAt: timestamp("seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("realtime_connections_user_idx").on(t.workspaceId, t.userId, t.seenAt),
    index("realtime_connections_seen_idx").on(t.seenAt),
  ],
);

export type RealtimeConnection = typeof realtimeConnections.$inferSelect;
