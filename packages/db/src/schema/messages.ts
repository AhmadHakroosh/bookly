import { sql } from "drizzle-orm";
import { index, pgTable, primaryKey, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { applications, opportunities } from "./hiring";
import { contacts } from "./scheduling";
import type { Solution } from "./solutions";
import { workspaces } from "./workspaces";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

/**
 * "guest": the one conversation with a contact. What the guest sees is email (the contact's
 * timeline emails in and out, booking-page notes); what stays inside is notes. Every member
 * sees it. "team": a thread between members, free-standing or about a contact; only its
 * participants see it.
 */
export type ThreadKind = "guest" | "team";

/** Messages (0.19.0): one row per conversation, carrying what the list shows. */
export const threads = pgTable(
  "threads",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    kind: text("kind").$type<ThreadKind>().notNull(),
    /** Clients or Hiring (ADR 0009); set from the route or the parent record. */
    solution: text("solution").$type<Solution>().notNull().default("clients"),
    /** Hiring: the candidate thread's application (one guest thread per application). */
    applicationId: text("application_id").references(() => applications.id, {
      onDelete: "cascade",
    }),
    /** Hiring: a team thread about an opportunity. */
    opportunityId: text("opportunity_id").references(() => opportunities.id, {
      onDelete: "cascade",
    }),
    /** Guest threads always; team threads when they are about someone. */
    contactId: text("contact_id").references(() => contacts.id, { onDelete: "cascade" }),
    /** Team threads; a guest thread is named after its contact. */
    subject: text("subject"),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    /** Newest entry of any kind (automatic emails included): the list's order. */
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }).notNull().defaultNow(),
    preview: text("preview"),
    /**
     * Newest entry someone wrote (a guest's email, a member's email, message or note), and who
     * (null: the guest). Unread = newer than your read mark and not yours; automatic emails
     * never make a thread unread.
     */
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    lastAuthorId: text("last_author_id").references(() => users.id, { onDelete: "set null" }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("threads_ws_activity_idx").on(t.workspaceId, t.lastActivityAt, t.id),
    index("threads_ws_solution_activity_idx").on(
      t.workspaceId,
      t.solution,
      t.lastActivityAt,
      t.id,
    ),
    // One client conversation per contact; one candidate conversation per application.
    uniqueIndex("threads_guest_contact_idx")
      .on(t.contactId)
      .where(sql`${t.kind} = 'guest' and ${t.solution} = 'clients'`),
    uniqueIndex("threads_guest_application_idx")
      .on(t.applicationId)
      .where(sql`${t.kind} = 'guest' and ${t.solution} = 'hiring'`),
    index("threads_contact_idx").on(t.contactId),
  ],
);

/** A note on a guest thread (internal), or a message in a team thread. Guest emails stay in contact_events. */
export const threadMessages = pgTable(
  "thread_messages",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    threadId: text("thread_id")
      .notNull()
      .references(() => threads.id, { onDelete: "cascade" }),
    authorId: text("author_id").references(() => users.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    mentions: text("mentions").array().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("thread_messages_thread_idx").on(t.threadId, t.createdAt, t.id)],
);

/** Who is in a team thread (its creator, the people they added, anyone @-mentioned). */
export const threadParticipants = pgTable(
  "thread_participants",
  {
    threadId: text("thread_id")
      .notNull()
      .references(() => threads.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.threadId, t.userId] }),
    index("thread_participants_user_idx").on(t.userId, t.workspaceId),
  ],
);

/** Where each member has read a thread up to; no row means never opened. */
export const threadReads = pgTable(
  "thread_reads",
  {
    threadId: text("thread_id")
      .notNull()
      .references(() => threads.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    readAt: timestamp("read_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.threadId, t.userId] })],
);

export type Thread = typeof threads.$inferSelect;
export type ThreadMessage = typeof threadMessages.$inferSelect;
