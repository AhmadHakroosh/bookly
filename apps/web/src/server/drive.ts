import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { loadEnv } from "@bookly/config";
import {
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  or,
  schema,
  sql,
} from "@bookly/db";
import type { FileSource, Folder, StoredFile, Workspace } from "@bookly/db/schema";
import type { EmailAttachment } from "@bookly/email";
import { getStorage } from "@bookly/storage";
import { db } from "@/lib/db";
import { FILE_RULES, extFor, keyFor } from "@/lib/files";
import { audit, SYSTEM_ACTOR } from "./audit";
import { logContactEvent } from "./contacts";
import { hasFeature, LimitError, assertStorageQuota } from "./limits";
import { baseUrl } from "./scheduling";

/*
 * The drive (0.18.0). Every attachment-kind file lives in a space: a member's My files
 * (`personal`), the team's shared space (`team`), or a contact's folder (`contact`). A file in
 * any space can also belong to a contact, which puts it in that contact's folder, and can be
 * linked to tasks and timeline entries (`file_links`). Who sees what:
 *   - personal files: the member who uploaded them;
 *   - team files and anything that belongs to a contact: every member of the workspace;
 *   - a file linked to a task: whoever can see the task.
 * Bytes go through the storage driver; this module never trusts a client-sent space or folder.
 */

export type Viewer = { userId: string; ws: Workspace };

/** Members see every task with assignment (Team), otherwise only their own. */
const seesAllTasks = (v: Viewer) => hasFeature(v.ws, "taskAssignment");

/** SQL: the files this member may see (live or in the trash, per `trash`). */
export function visibleFiles(v: Viewer, opts: { trash?: boolean } = {}) {
  const f = schema.files;
  const linkedTask = sql`exists (
    select 1 from ${schema.fileLinks} l join ${schema.tasks} t on t.id = l.target_id
    where l.file_id = ${f.id} and l.target_type = 'task'
    ${seesAllTasks(v) ? sql`` : sql`and t.user_id = ${v.userId}`}
  )`;
  return and(
    eq(f.workspaceId, v.ws.id),
    eq(f.kind, "attachment"),
    eq(f.status, "ready"),
    opts.trash ? isNotNull(f.deletedAt) : isNull(f.deletedAt),
    or(
      and(eq(f.space, "personal"), eq(f.uploadedBy, v.userId)),
      inArray(f.space, ["team", "contact"]),
      isNotNull(f.contactId),
      linkedTask,
    ),
  )!;
}

export async function canSeeFile(v: Viewer, fileId: string): Promise<StoredFile | null> {
  if (!/^[0-9a-f-]{36}$/i.test(fileId)) return null;
  const [row] = await db()
    .select()
    .from(schema.files)
    .where(and(eq(schema.files.id, fileId), visibleFiles(v)))
    .limit(1);
  return row ?? null;
}

/** Only these open in the browser; everything else downloads (never rendered on our origin). */
export const PREVIEWABLE = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/avif",
  "application/pdf",
]);

/** A MIME type safe to serve back: the upload allow-list as is, anything else as a download. */
export const safeMime = (mime: string | null | undefined) => {
  const m = (mime ?? "").toLowerCase().split(";")[0]!.trim();
  return FILE_RULES.attachment.mimes.includes(m) ? m : "application/octet-stream";
};

/* ---------------- Listing ---------------- */

export type FileCursor = { name: string; id: string };
export const encodeFileCursor = (f: Pick<StoredFile, "name" | "id">) =>
  Buffer.from(`${f.name}\u0000${f.id}`).toString("base64url");
export function decodeFileCursor(s: unknown): FileCursor | null {
  if (typeof s !== "string" || !s) return null;
  const [name, id] = Buffer.from(s, "base64url").toString().split("\u0000");
  return name !== undefined && id ? { name, id } : null;
}

export const PAGE = 50;

export type DriveRow = StoredFile & { contactName: string | null; ownerName: string | null };

function filesQuery() {
  return db()
    .select({
      f: schema.files,
      contactName: sql<
        string | null
      >`coalesce(nullif(${schema.contacts.name}, ''), ${schema.contacts.email})`,
      ownerName: schema.users.name,
    })
    .from(schema.files)
    .leftJoin(schema.contacts, eq(schema.contacts.id, schema.files.contactId))
    .leftJoin(schema.users, eq(schema.users.id, schema.files.uploadedBy));
}

const rows = (
  r: { f: StoredFile; contactName: string | null; ownerName: string | null }[],
): DriveRow[] => r.map((x) => ({ ...x.f, contactName: x.contactName, ownerName: x.ownerName }));

const byName = (cursor: FileCursor | null) =>
  cursor
    ? or(
        sql`lower(${schema.files.name}) > lower(${cursor.name})`,
        and(
          sql`lower(${schema.files.name}) = lower(${cursor.name})`,
          sql`${schema.files.id} > ${cursor.id}`,
        ),
      )
    : undefined;

async function page(
  where: ReturnType<typeof and>,
  cursor: FileCursor | null,
  order: "name" | "recent" = "name",
) {
  const q = filesQuery()
    .where(and(where, order === "name" ? byName(cursor) : undefined))
    .orderBy(
      ...(order === "name"
        ? [sql`lower(${schema.files.name})`, asc(schema.files.id)]
        : [
            desc(
              sql`coalesce(${schema.files.updatedAt}, ${schema.files.readyAt}, ${schema.files.createdAt})`,
            ),
            desc(schema.files.id),
          ]),
    )
    .limit(PAGE + 1);
  const list = rows(await q);
  const out = list.slice(0, PAGE);
  return { files: out, next: list.length > PAGE ? encodeFileCursor(out[out.length - 1]!) : null };
}

/** A folder (or a space's root) in My files or the team space: its subfolders and one page of files. */
export async function listFolder(
  v: Viewer,
  space: "personal" | "team",
  folderId: string | null,
  cursor: FileCursor | null = null,
) {
  const folderConds = and(
    eq(schema.folders.workspaceId, v.ws.id),
    eq(schema.folders.space, space),
    isNull(schema.folders.deletedAt),
    folderId ? eq(schema.folders.parentId, folderId) : isNull(schema.folders.parentId),
    space === "personal" ? eq(schema.folders.ownerUserId, v.userId) : undefined,
  );
  const [folders, files] = await Promise.all([
    cursor
      ? Promise.resolve([] as Folder[])
      : db()
          .select()
          .from(schema.folders)
          .where(folderConds)
          .orderBy(sql`lower(${schema.folders.name})`)
          .limit(500),
    page(
      and(
        visibleFiles(v),
        eq(schema.files.space, space),
        space === "personal" ? eq(schema.files.uploadedBy, v.userId) : undefined,
        folderId ? eq(schema.files.folderId, folderId) : isNull(schema.files.folderId),
      ),
      cursor,
    ),
  ]);
  return { folders, ...files };
}

/** A contact's folder: what they sent ("received") and what belongs to them ("ours"). */
export async function listContactFiles(
  v: Viewer,
  contactId: string,
  filter: "all" | "received" | "ours" = "all",
  cursor: FileCursor | null = null,
) {
  const received = inArray(schema.files.source, ["email", "message", "booking"]);
  return page(
    and(
      visibleFiles(v),
      eq(schema.files.contactId, contactId),
      filter === "received" ? received : filter === "ours" ? sql`not (${received})` : undefined,
    ),
    cursor,
  );
}

/** Contacts that have files, with how many, for the Contacts space. */
export async function contactsWithFiles(v: Viewer) {
  return db()
    .select({
      id: schema.contacts.id,
      name: sql<string>`coalesce(nullif(${schema.contacts.name}, ''), ${schema.contacts.email})`,
      count: sql<number>`count(${schema.files.id})::int`,
    })
    .from(schema.files)
    .innerJoin(schema.contacts, eq(schema.contacts.id, schema.files.contactId))
    .where(visibleFiles(v))
    .groupBy(schema.contacts.id)
    .orderBy(sql`lower(coalesce(nullif(${schema.contacts.name}, ''), ${schema.contacts.email}))`)
    .limit(500);
}

/** Everything the member can see, newest first. */
export const listRecent = (v: Viewer, cursor: FileCursor | null = null) =>
  page(visibleFiles(v), cursor, cursor ? "name" : "recent");

/** Search by name across everything the member can see. */
export const searchFiles = (v: Viewer, q: string, cursor: FileCursor | null = null) =>
  page(
    and(visibleFiles(v), ilike(schema.files.name, `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`)),
    cursor,
  );

/** The trash: the member's own deleted files and the team's (deleted folders come back with their files). */
export async function listTrash(v: Viewer) {
  const [files, folders] = await Promise.all([
    filesQuery()
      .where(visibleFiles(v, { trash: true }))
      .orderBy(desc(schema.files.deletedAt))
      .limit(200),
    db()
      .select()
      .from(schema.folders)
      .where(
        and(
          eq(schema.folders.workspaceId, v.ws.id),
          isNotNull(schema.folders.deletedAt),
          or(eq(schema.folders.space, "team"), eq(schema.folders.ownerUserId, v.userId)),
        ),
      )
      .orderBy(desc(schema.folders.deletedAt))
      .limit(200),
  ]);
  return { files: rows(files), folders };
}

/** Links of one file: tasks (with titles), timeline entries, the contact. */
export async function fileDetails(v: Viewer, fileId: string) {
  const file = await canSeeFile(v, fileId);
  if (!file) return null;
  const links = await db()
    .select({
      l: schema.fileLinks,
      taskTitle: schema.tasks.title,
      taskContact: schema.tasks.contactId,
    })
    .from(schema.fileLinks)
    .leftJoin(
      schema.tasks,
      and(eq(schema.fileLinks.targetType, "task"), eq(schema.tasks.id, schema.fileLinks.targetId)),
    )
    .where(eq(schema.fileLinks.fileId, file.id));
  const contact = file.contactId
    ? await db().query.contacts.findFirst({
        where: eq(schema.contacts.id, file.contactId),
        columns: { id: true, name: true, email: true },
      })
    : null;
  return {
    file,
    contact,
    tasks: links
      .filter((x) => x.l.targetType === "task")
      .map((x) => ({ id: x.l.targetId, title: x.taskTitle ?? "Task" })),
    entries: links.filter((x) => x.l.targetType === "contact_event").map((x) => x.l.targetId),
  };
}

export async function breadcrumbs(v: Viewer, folderId: string | null) {
  const trail: Folder[] = [];
  let id = folderId;
  for (let i = 0; id && i < 20; i++) {
    const f = await db().query.folders.findFirst({
      where: and(eq(schema.folders.id, id), eq(schema.folders.workspaceId, v.ws.id)),
    });
    if (!f) break;
    trail.unshift(f);
    id = f.parentId;
  }
  return trail;
}

/** A folder this member may put things in (theirs in My files, any in the team space). */
export async function writableFolder(v: Viewer, folderId: string) {
  const f = await db().query.folders.findFirst({
    where: and(
      eq(schema.folders.id, folderId),
      eq(schema.folders.workspaceId, v.ws.id),
      isNull(schema.folders.deletedAt),
    ),
  });
  if (!f) return null;
  if (f.space === "personal" && f.ownerUserId !== v.userId) return null;
  if (f.space === "team" && !hasFeature(v.ws, "sharedFolders")) return null;
  return f;
}

/* ---------------- Folders ---------------- */

export const cleanName = (name: string) =>
  name
    .replace(/[\u0000-\u001f/\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);

export async function createFolder(
  v: Viewer,
  space: "personal" | "team",
  parentId: string | null,
  name: string,
) {
  const clean = cleanName(name);
  if (!clean) throw new Error("Name the folder.");
  if (space === "team" && !hasFeature(v.ws, "sharedFolders"))
    throw new LimitError("Team folders come with Team.", "team");
  if (parentId) {
    const parent = await writableFolder(v, parentId);
    if (!parent || parent.space !== space) throw new Error("That folder is gone.");
  }
  const [f] = await db()
    .insert(schema.folders)
    .values({
      workspaceId: v.ws.id,
      name: clean,
      parentId,
      space,
      ownerUserId: space === "personal" ? v.userId : null,
      createdBy: v.userId,
    })
    .returning();
  return f!;
}

export async function renameFolder(v: Viewer, folderId: string, name: string) {
  const f = await writableFolder(v, folderId);
  if (!f) throw new Error("That folder is gone.");
  const clean = cleanName(name);
  if (!clean) throw new Error("Name the folder.");
  await db()
    .update(schema.folders)
    .set({ name: clean, updatedAt: new Date() })
    .where(eq(schema.folders.id, f.id));
  return { before: f.name, after: clean, folder: f };
}

/** Folder ids under (and including) a folder. */
async function subtree(wsId: string, folderId: string): Promise<string[]> {
  const r = await db().execute<{ id: string }>(sql`
    with recursive t(id) as (
      select id from ${schema.folders} where id = ${folderId} and workspace_id = ${wsId}
      union all
      select f.id from ${schema.folders} f join t on f.parent_id = t.id
    ) select id from t`);
  return (r.rows as { id: string }[]).map((x) => x.id);
}

/** To the trash with everything inside; a restore brings back what was deleted at the same moment. */
export async function trashFolder(v: Viewer, folderId: string) {
  const f = await writableFolder(v, folderId);
  if (!f) throw new Error("That folder is gone.");
  const ids = await subtree(v.ws.id, f.id);
  const at = new Date();
  await db().update(schema.folders).set({ deletedAt: at }).where(inArray(schema.folders.id, ids));
  await db()
    .update(schema.files)
    .set({ deletedAt: at })
    .where(and(inArray(schema.files.folderId, ids), isNull(schema.files.deletedAt)));
  return { folder: f, ids };
}

export async function restoreFolder(v: Viewer, folderId: string) {
  const f = await db().query.folders.findFirst({
    where: and(eq(schema.folders.id, folderId), eq(schema.folders.workspaceId, v.ws.id)),
  });
  if (!f?.deletedAt || (f.space === "personal" && f.ownerUserId !== v.userId))
    throw new Error("Nothing to restore.");
  const ids = await subtree(v.ws.id, f.id);
  const at = f.deletedAt;
  await db()
    .update(schema.folders)
    .set({ deletedAt: null })
    .where(and(inArray(schema.folders.id, ids), eq(schema.folders.deletedAt, at)));
  await db()
    .update(schema.files)
    .set({ deletedAt: null })
    .where(and(inArray(schema.files.folderId, ids), eq(schema.files.deletedAt, at)));
  // Its parent may be in the trash on its own: bring it back to the top level instead.
  if (f.parentId) {
    const parent = await db().query.folders.findFirst({ where: eq(schema.folders.id, f.parentId) });
    if (!parent || parent.deletedAt)
      await db().update(schema.folders).set({ parentId: null }).where(eq(schema.folders.id, f.id));
  }
  return f;
}

/* ---------------- Files ---------------- */

/** A file this member may change: their own personal files, team files (Team), contact files. */
export async function writableFile(v: Viewer, fileId: string, opts: { trash?: boolean } = {}) {
  const [f] = await db()
    .select()
    .from(schema.files)
    .where(and(eq(schema.files.id, fileId), visibleFiles(v, opts)))
    .limit(1);
  if (!f) return null;
  if (f.space === "personal" && f.uploadedBy !== v.userId) return null;
  return f;
}

export async function renameFile(v: Viewer, fileId: string, name: string) {
  const f = await writableFile(v, fileId);
  if (!f) throw new Error("That file is not yours to rename.");
  const clean = cleanName(name);
  if (!clean) throw new Error("Name the file.");
  await db()
    .update(schema.files)
    .set({ name: clean, updatedAt: new Date() })
    .where(eq(schema.files.id, f.id));
  return { before: f.name, after: clean, file: f };
}

/** Moves a file to My files, the team space or one of their folders; its contact stays. */
export async function moveFile(
  v: Viewer,
  fileId: string,
  space: "personal" | "team",
  folderId: string | null,
) {
  const f = await writableFile(v, fileId);
  if (!f) throw new Error("That file is not yours to move.");
  if (space === "team" && !hasFeature(v.ws, "sharedFolders"))
    throw new LimitError("Team folders come with Team.", "team");
  if (folderId) {
    const folder = await writableFolder(v, folderId);
    if (!folder || folder.space !== space) throw new Error("That folder is gone.");
  }
  // A personal file someone else uploaded cannot become "mine": moving to My files is for the uploader.
  if (space === "personal" && f.uploadedBy !== v.userId)
    throw new Error("Only who uploaded it can keep it in My files.");
  await db()
    .update(schema.files)
    .set({ space, folderId, updatedAt: new Date() })
    .where(eq(schema.files.id, f.id));
  return f;
}

export async function setFileContact(v: Viewer, fileId: string, contactId: string | null) {
  const f = await writableFile(v, fileId);
  if (!f) throw new Error("That file is not yours to change.");
  if (contactId) {
    const c = await db().query.contacts.findFirst({
      where: and(eq(schema.contacts.id, contactId), eq(schema.contacts.workspaceId, v.ws.id)),
      columns: { id: true },
    });
    if (!c) throw new Error("That contact is gone.");
  }
  await db()
    .update(schema.files)
    .set({ contactId, updatedAt: new Date() })
    .where(eq(schema.files.id, f.id));
  return f;
}

export async function trashFile(v: Viewer, fileId: string) {
  const f = await writableFile(v, fileId);
  if (!f) throw new Error("That file is not yours to delete.");
  await db().update(schema.files).set({ deletedAt: new Date() }).where(eq(schema.files.id, f.id));
  return f;
}

export async function restoreFile(v: Viewer, fileId: string) {
  const f = await writableFile(v, fileId, { trash: true });
  if (!f) throw new Error("Nothing to restore.");
  // Back to the top of its space when its folder is gone or still in the trash.
  const folder = f.folderId
    ? await db().query.folders.findFirst({ where: eq(schema.folders.id, f.folderId) })
    : null;
  await db()
    .update(schema.files)
    .set({ deletedAt: null, ...(folder && !folder.deletedAt ? {} : { folderId: null }) })
    .where(eq(schema.files.id, f.id));
  return f;
}

/** Deletes a trashed file for good: bytes and row. */
export async function purgeFile(v: Viewer, fileId: string) {
  const f = await writableFile(v, fileId, { trash: true });
  if (!f) throw new Error("Nothing to delete.");
  await getStorage()
    .delete(f.key)
    .catch((e) => console.error("[drive] delete", f.key, e));
  await db().delete(schema.files).where(eq(schema.files.id, f.id));
  return f;
}

/** The trash keeps things 30 days (called from the tick). */
export const TRASH_DAYS = 30;
export async function purgeTrash(now = new Date()) {
  const cutoff = new Date(now.getTime() - TRASH_DAYS * 86_400_000);
  const old = await db()
    .select()
    .from(schema.files)
    .where(and(isNotNull(schema.files.deletedAt), lt(schema.files.deletedAt, cutoff)))
    .limit(500);
  for (const f of old)
    await getStorage()
      .delete(f.key)
      .catch(() => {});
  if (old.length)
    await db()
      .delete(schema.files)
      .where(
        inArray(
          schema.files.id,
          old.map((f) => f.id),
        ),
      );
  await db()
    .delete(schema.folders)
    .where(and(isNotNull(schema.folders.deletedAt), lt(schema.folders.deletedAt, cutoff)));
  return old.length;
}

/* ---------------- Links, contacts and the timeline ---------------- */

/** Puts a file on its contact's timeline (once per file and task), linked back from the file. */
export async function fileOnTimeline(
  ws: Pick<Workspace, "id">,
  file: Pick<StoredFile, "id" | "name" | "size">,
  contactId: string,
  opts: { task?: { id: string; title: string } | null; userId?: string | null } = {},
) {
  const already = await db().query.contactEvents.findFirst({
    where: and(
      eq(schema.contactEvents.contactId, contactId),
      eq(schema.contactEvents.type, "file"),
      sql`${schema.contactEvents.data}->>'fileId' = ${file.id}`,
      opts.task
        ? sql`${schema.contactEvents.data}->>'taskId' = ${opts.task.id}`
        : sql`${schema.contactEvents.data}->>'taskId' is null`,
    ),
    columns: { id: true },
  });
  if (already) return already.id;
  const id = crypto.randomUUID();
  await logContactEvent(
    ws.id,
    contactId,
    "file",
    opts.task ? `File added to “${opts.task.title}”: ${file.name}` : `File added: ${file.name}`,
    {
      id,
      data: {
        fileId: file.id,
        name: file.name,
        size: file.size,
        taskId: opts.task?.id ?? null,
        addedBy: opts.userId ?? null,
      },
    },
  );
  await db()
    .insert(schema.fileLinks)
    .values({
      workspaceId: ws.id,
      fileId: file.id,
      targetType: "contact_event",
      targetId: id,
      createdBy: opts.userId ?? null,
    })
    .onConflictDoNothing();
  return id;
}

/**
 * Links a file to a task the member can see. When the task belongs to a contact the file joins
 * the contact's folder (if it belongs to nobody yet) and shows on their timeline.
 */
export async function linkFileToTask(v: Viewer, fileId: string, taskId: string) {
  const [file, task] = await Promise.all([
    canSeeFile(v, fileId),
    db().query.tasks.findFirst({
      where: and(eq(schema.tasks.id, taskId), eq(schema.tasks.workspaceId, v.ws.id)),
    }),
  ]);
  if (!file) throw new Error("That file is gone.");
  if (!task || (!seesAllTasks(v) && task.userId !== v.userId))
    throw new Error("That task is gone.");
  await db()
    .insert(schema.fileLinks)
    .values({
      workspaceId: v.ws.id,
      fileId: file.id,
      targetType: "task",
      targetId: task.id,
      createdBy: v.userId,
    })
    .onConflictDoNothing();
  if (task.contactId) {
    if (!file.contactId)
      await db()
        .update(schema.files)
        .set({ contactId: task.contactId })
        .where(eq(schema.files.id, file.id));
    await fileOnTimeline(v.ws, file, file.contactId ?? task.contactId, { task, userId: v.userId });
  }
  return { file, task };
}

export async function unlinkFileFromTask(v: Viewer, fileId: string, taskId: string) {
  const file = await canSeeFile(v, fileId);
  if (!file) throw new Error("That file is gone.");
  await db()
    .delete(schema.fileLinks)
    .where(
      and(
        eq(schema.fileLinks.fileId, file.id),
        eq(schema.fileLinks.targetType, "task"),
        eq(schema.fileLinks.targetId, taskId),
      ),
    );
  return file;
}

export async function taskFiles(v: Viewer, taskId: string): Promise<DriveRow[]> {
  return rows(
    await filesQuery()
      .where(
        and(
          visibleFiles(v),
          sql`exists (select 1 from ${schema.fileLinks} l where l.file_id = ${schema.files.id} and l.target_type = 'task' and l.target_id = ${taskId})`,
        ),
      )
      .orderBy(asc(schema.files.createdAt))
      .limit(100),
  );
}

/**
 * After an upload completes in the drive: links it to the task it was uploaded on, and puts it
 * on its contact's timeline.
 */
export async function afterDriveUpload(v: Viewer, file: StoredFile) {
  if (file.source === "task" && file.sourceId) await linkFileToTask(v, file.id, file.sourceId);
  else if (file.contactId) await fileOnTimeline(v.ws, file, file.contactId, { userId: v.userId });
}

/* ---------------- Guests' attachments ---------------- */

type ResendAttachment = {
  id: string;
  filename: string;
  size?: number;
  content_type?: string;
  content_disposition?: string;
  download_url?: string;
};

/** The largest single attachment kept from a guest's email. */
const MAX_RECEIVED = 25 * 1024 * 1024;

export type KeptAttachment = { filename: string; fileId: string | null; reason?: string };

/**
 * Keeps the attachments of a received email in the contact's folder (Pro and up, within the
 * storage quota): each is downloaded from Resend and written through the storage driver.
 * Inline images (signatures, logos) are skipped. Returns one entry per attachment for the
 * timeline, with why one was not kept.
 */
export async function keepReceivedAttachments(
  ws: Workspace,
  emailId: string,
  contactId: string,
  eventId: string,
): Promise<KeptAttachment[]> {
  const env = loadEnv();
  if (!env.RESEND_API_KEY) return [];
  const res = await fetch(
    `${env.RESEND_API_URL.replace(/\/$/, "")}/emails/receiving/${encodeURIComponent(emailId)}/attachments`,
    {
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}` },
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!res.ok) return [];
  const list = ((await res.json()) as { data?: ResendAttachment[] }).data ?? [];
  const out: KeptAttachment[] = [];
  for (const a of list) {
    const type = (a.content_type ?? "").toLowerCase();
    if (a.content_disposition === "inline" && type.startsWith("image/")) continue;
    const name = cleanName(a.filename || "attachment");
    if (!hasFeature(ws, "attachments")) {
      out.push({ filename: name, fileId: null, reason: "plan" });
      continue;
    }
    if (!a.download_url || (a.size ?? 0) > MAX_RECEIVED) {
      out.push({ filename: name, fileId: null, reason: "too large" });
      continue;
    }
    try {
      await assertStorageQuota(ws, a.size ?? 0);
      const r = await fetch(a.download_url, { signal: AbortSignal.timeout(30_000) });
      if (!r.ok) throw new Error(`download ${r.status}`);
      const body = Buffer.from(await r.arrayBuffer());
      if (body.length > MAX_RECEIVED) throw new Error("too large");
      const mime = safeMime(type);
      const id = crypto.randomUUID();
      const key = keyFor(ws.id, "attachment", id, extFor(mime, name));
      await getStorage().put(key, body, { contentType: mime, cacheControl: "private, max-age=0" });
      await db()
        .insert(schema.files)
        .values({
          id,
          workspaceId: ws.id,
          kind: "attachment",
          key,
          name,
          mime,
          size: body.length,
          visibility: "private",
          status: "ready",
          readyAt: new Date(),
          space: "contact",
          contactId,
          source: "email" satisfies FileSource,
          sourceId: eventId,
        });
      await db()
        .insert(schema.fileLinks)
        .values({ workspaceId: ws.id, fileId: id, targetType: "contact_event", targetId: eventId })
        .onConflictDoNothing();
      await audit({
        workspace: ws.id,
        actor: SYSTEM_ACTOR("email"),
        action: "file.received",
        target: { type: "file", id, label: name },
        changes: { size: { to: body.length }, contactId: { to: contactId } },
      });
      out.push({ filename: name, fileId: id });
    } catch (e) {
      out.push({
        filename: name,
        fileId: null,
        reason: e instanceof LimitError ? "storage full" : "not kept",
      });
      if (!(e instanceof LimitError)) console.error("[drive] attachment", e);
    }
  }
  return out;
}

/* ---------------- Sending ---------------- */

const signLink = (id: string, exp: number) =>
  createHmac("sha256", loadEnv().AUTH_SECRET)
    .update(`file:${id}:${exp}`)
    .digest("hex")
    .slice(0, 32);

/** A download link that works without signing in, until `days` from now. */
export function signedFileLink(fileId: string, days = 7, base = baseUrl()) {
  const exp = Math.floor(Date.now() / 1000) + days * 86_400;
  return `${base.replace(/\/$/, "")}/files/${fileId}?t=${exp}.${signLink(fileId, exp)}`;
}

export function readFileToken(fileId: string, token: string | null, now = Date.now()) {
  if (!token) return false;
  const [expStr, sig] = token.split(".");
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp * 1000 < now || !sig) return false;
  const a = Buffer.from(sig);
  const b = Buffer.from(signLink(fileId, exp));
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Files up to this total go as real attachments; anything past it goes as a link. */
export const ATTACH_LIMIT = 10 * 1024 * 1024;

/**
 * Turns drive files the member can see into email attachments (while they fit) and signed
 * links (for the rest).
 */
export async function filesForEmail(v: Viewer, fileIds: string[], base?: string) {
  const ids = [...new Set(fileIds)].slice(0, 20);
  const files = ids.length
    ? await db()
        .select()
        .from(schema.files)
        .where(and(inArray(schema.files.id, ids), visibleFiles(v)))
    : [];
  const attachments: EmailAttachment[] = [];
  const links: { name: string; url: string }[] = [];
  let total = 0;
  for (const f of files) {
    if (total + f.size <= ATTACH_LIMIT) {
      attachments.push({
        filename: f.name,
        content: await getStorage().get(f.key),
        contentType: f.mime,
      });
      total += f.size;
    } else links.push({ name: f.name, url: signedFileLink(f.id, 7, base) });
  }
  return { files, attachments, links };
}

/** The text block listing files that went as links. */
export const linksText = (links: { name: string; url: string }[]) =>
  links.length
    ? `\n\nFiles (links work for 7 days):\n${links.map((l) => `- ${l.name}: ${l.url}`).join("\n")}`
    : "";

/* ---------------- Uploads into the drive ---------------- */

export type DriveTarget = {
  space?: "personal" | "team";
  folderId?: string | null;
  contactId?: string | null;
  taskId?: string | null;
};

/**
 * Where an upload lands, checked against what the member may do: a task (its contact's folder
 * when it has one, otherwise the uploader's My files, linked to the task), a contact's folder,
 * a folder, or the root of My files / the team space.
 */
export async function resolveTarget(v: Viewer, t: DriveTarget) {
  if (!hasFeature(v.ws, "attachments")) throw new LimitError("Files come with Pro.", "pro");
  if (t.taskId) {
    const task = await db().query.tasks.findFirst({
      where: and(eq(schema.tasks.id, t.taskId), eq(schema.tasks.workspaceId, v.ws.id)),
    });
    if (!task || (!seesAllTasks(v) && task.userId !== v.userId))
      throw new Error("That task is gone.");
    return {
      space: task.contactId ? ("contact" as const) : ("personal" as const),
      folderId: null,
      contactId: task.contactId,
      source: "task" as const,
      sourceId: task.id,
    };
  }
  if (t.contactId) {
    const c = await db().query.contacts.findFirst({
      where: and(eq(schema.contacts.id, t.contactId), eq(schema.contacts.workspaceId, v.ws.id)),
      columns: { id: true },
    });
    if (!c) throw new Error("That contact is gone.");
    return {
      space: "contact" as const,
      folderId: null,
      contactId: c.id,
      source: "upload" as const,
      sourceId: null,
    };
  }
  if (t.folderId) {
    const f = await writableFolder(v, t.folderId);
    if (!f) throw new Error("That folder is gone.");
    return {
      space: f.space,
      folderId: f.id,
      contactId: null,
      source: "upload" as const,
      sourceId: null,
    };
  }
  const space: "personal" | "team" = t.space === "team" ? "team" : "personal";
  if (space === "team" && !hasFeature(v.ws, "sharedFolders"))
    throw new LimitError("Team folders come with Team.", "team");
  return { space, folderId: null, contactId: null, source: "upload" as const, sourceId: null };
}

/** Every live folder of a space the member may use, with its path, for the move dialog. */
export async function allFolders(v: Viewer, space: "personal" | "team") {
  const list = await db()
    .select()
    .from(schema.folders)
    .where(
      and(
        eq(schema.folders.workspaceId, v.ws.id),
        eq(schema.folders.space, space),
        isNull(schema.folders.deletedAt),
        space === "personal" ? eq(schema.folders.ownerUserId, v.userId) : undefined,
      ),
    )
    .limit(1000);
  const byId = new Map(list.map((f) => [f.id, f]));
  const path = (f: Folder) => {
    const parts = [f.name];
    let p = f.parentId ? byId.get(f.parentId) : undefined;
    for (let i = 0; p && i < 20; i++) {
      parts.unshift(p.name);
      p = p.parentId ? byId.get(p.parentId) : undefined;
    }
    return parts.join(" / ");
  };
  return list
    .map((f) => ({ id: f.id, path: path(f) }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

/** After an email with drive files went out: link them to its timeline entry and log each one. */
export async function recordSentFiles(
  ws: Pick<Workspace, "id">,
  eventId: string,
  files: Pick<StoredFile, "id" | "name" | "size">[],
  userId: string,
) {
  for (const f of files) {
    await db()
      .insert(schema.fileLinks)
      .values({
        workspaceId: ws.id,
        fileId: f.id,
        targetType: "contact_event",
        targetId: eventId,
        createdBy: userId,
      })
      .onConflictDoNothing();
    await audit({
      workspace: ws.id,
      action: "file.sent",
      target: { type: "file", id: f.id, label: f.name },
      changes: { email: { to: eventId } },
    });
  }
}
