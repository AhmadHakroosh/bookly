import { bigint, index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { workspaces } from "./workspaces";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

/** What a file is for; decides the size cap, the allowed types and whether it is public. */
export type FileKind = "avatar" | "logo" | "background" | "attachment";
/** public: anyone with the link (avatars, logos); private: members of the workspace only. */
export type FileVisibility = "public" | "private";
/** pending: a presigned upload was issued and not confirmed yet; ready: bytes are in place. */
export type FileStatus = "pending" | "ready";

/**
 * Every uploaded file. The bytes live in the storage driver (local disk or an S3 bucket) under
 * `key`; this row is what quotas, cleanup, the activity log and `/files/<id>` work from.
 */
export const files = pgTable(
  "files",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    kind: text("kind").$type<FileKind>().notNull(),
    /** Storage key: `ws/<workspace>/<kind>/<id>.<ext>`. */
    key: text("key").notNull(),
    /** The name the uploader gave it, for downloads and the activity log. */
    name: text("name").notNull(),
    mime: text("mime").notNull(),
    size: bigint("size", { mode: "number" }).notNull().default(0),
    sha256: text("sha256"),
    visibility: text("visibility").$type<FileVisibility>().notNull().default("private"),
    status: text("status").$type<FileStatus>().notNull().default("pending"),
    uploadedBy: text("uploaded_by").references(() => users.id, { onDelete: "set null" }),
    /** What the file belongs to (profile, workspace, booking, contact…), for replacement and cleanup. */
    ownerType: text("owner_type"),
    ownerId: text("owner_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    readyAt: timestamp("ready_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("files_key_idx").on(t.key),
    index("files_ws_created_idx").on(t.workspaceId, t.createdAt),
    index("files_ws_status_idx").on(t.workspaceId, t.status),
    index("files_owner_idx").on(t.ownerType, t.ownerId),
  ],
);

export type StoredFile = typeof files.$inferSelect;
