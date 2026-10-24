import { sql } from "drizzle-orm";
import { bigint, index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { contacts } from "./scheduling";
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
 * Where a drive file lives (attachments only; avatars, logos and backgrounds have none):
 * `personal` is one member's My files, `team` the workspace's shared space, `contact` a
 * contact's folder. A file in any space can also belong to a contact (`contactId`), which puts
 * it in that contact's folder too.
 */
export type FileSpace = "personal" | "team" | "contact";
/** How a drive file arrived: uploaded by a member, or received from a contact. */
export type FileSource = "upload" | "email" | "message" | "booking" | "task" | "form";

/** A folder in My files (personal) or the team space; folders nest through `parentId`. */
export const folders = pgTable(
  "folders",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    parentId: text("parent_id"),
    space: text("space").$type<"personal" | "team">().notNull(),
    /** The member whose My files it is in (personal only). */
    ownerUserId: text("owner_user_id").references(() => users.id, { onDelete: "cascade" }),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    /** In the trash since; the files inside share the timestamp so a restore brings them back. */
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("folders_ws_parent_idx").on(t.workspaceId, t.space, t.parentId)],
);

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
    /* ---- the drive (0.18.0; attachments only) ---- */
    space: text("space").$type<FileSpace>(),
    folderId: text("folder_id").references(() => folders.id, { onDelete: "set null" }),
    contactId: text("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    source: text("source").$type<FileSource>(),
    /** The timeline entry, message or booking it came with. */
    sourceId: text("source_id"),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("files_key_idx").on(t.key),
    index("files_drive_idx").on(t.workspaceId, t.space, t.folderId, t.name, t.id),
    index("files_contact_idx")
      .on(t.contactId, t.createdAt, t.id)
      .where(sql`${t.contactId} is not null`),
    index("files_ws_created_idx").on(t.workspaceId, t.createdAt),
    index("files_ws_status_idx").on(t.workspaceId, t.status),
    index("files_owner_idx").on(t.ownerType, t.ownerId),
  ],
);

export type StoredFile = typeof files.$inferSelect;

/** What a file is linked to besides its folder: a task, a timeline entry, a booking. */
export type FileLinkTarget = "task" | "contact_event" | "booking" | "thread_message";

export const fileLinks = pgTable(
  "file_links",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    fileId: text("file_id")
      .notNull()
      .references(() => files.id, { onDelete: "cascade" }),
    targetType: text("target_type").$type<FileLinkTarget>().notNull(),
    targetId: text("target_id").notNull(),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("file_links_unique_idx").on(t.fileId, t.targetType, t.targetId),
    index("file_links_target_idx").on(t.targetType, t.targetId),
  ],
);

export type Folder = typeof folders.$inferSelect;
export type FileLink = typeof fileLinks.$inferSelect;
