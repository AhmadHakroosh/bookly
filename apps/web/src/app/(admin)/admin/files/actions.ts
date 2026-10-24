"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/server/audit";
import {
  createFolder,
  decodeFileCursor,
  linkFileToTask,
  listContactFiles,
  listFolder,
  listRecent,
  moveFile,
  purgeFile,
  renameFile,
  renameFolder,
  restoreFile,
  restoreFolder,
  searchFiles,
  setFileContact,
  trashFile,
  trashFolder,
  unlinkFileFromTask,
  type DriveRow,
  type Viewer,
} from "@/server/drive";
import { hasFlag } from "@/server/flags";
import { hasFeature } from "@/server/limits";
import { requireStaff } from "@/server/session";
import { getCurrentWorkspace } from "@/server/workspace";

/*
 * Everything the drive writes. Each action checks the `files` flag and the plan (`attachments`,
 * and `sharedFolders` for the team space, enforced again in server/drive.ts) and is audited.
 */

async function viewer(): Promise<Viewer | null> {
  const [{ session }, ws] = await Promise.all([requireStaff(), getCurrentWorkspace()]);
  if (!ws || !(await hasFlag(ws, "files")) || !hasFeature(ws, "attachments")) return null;
  return { userId: session.user.id, ws };
}

export type DriveResult = { ok?: boolean; error?: string };

async function run(fn: (v: Viewer) => Promise<void>): Promise<DriveResult> {
  const v = await viewer();
  if (!v) return { error: "Files come with Pro." };
  try {
    await fn(v);
  } catch (e) {
    return { error: (e as Error).message };
  }
  revalidatePath("/admin", "layout");
  return { ok: true };
}

const fileTarget = (f: { id: string; name: string }) => ({ type: "file", id: f.id, label: f.name });
const folderTarget = (f: { id: string; name: string }) => ({
  type: "folder",
  id: f.id,
  label: f.name,
});

export async function createFolderAction(
  space: "personal" | "team",
  parentId: string | null,
  name: string,
) {
  return run(async (v) => {
    const f = await createFolder(v, space, parentId, name);
    await audit({
      action: "folder.created",
      target: folderTarget(f),
      changes: { space: { to: space } },
    });
  });
}

export async function renameFolderAction(folderId: string, name: string) {
  return run(async (v) => {
    const r = await renameFolder(v, folderId, name);
    await audit({
      action: "folder.renamed",
      target: folderTarget(r.folder),
      changes: { name: { from: r.before, to: r.after } },
    });
  });
}

export async function trashFolderAction(folderId: string) {
  return run(async (v) => {
    const r = await trashFolder(v, folderId);
    await audit({
      action: "folder.trashed",
      target: folderTarget(r.folder),
      changes: { folders: { to: r.ids.length } },
    });
  });
}

export async function restoreFolderAction(folderId: string) {
  return run(async (v) => {
    const f = await restoreFolder(v, folderId);
    await audit({ action: "folder.restored", target: folderTarget(f) });
  });
}

export async function renameFileAction(fileId: string, name: string) {
  return run(async (v) => {
    const r = await renameFile(v, fileId, name);
    await audit({
      action: "file.renamed",
      target: fileTarget(r.file),
      changes: { name: { from: r.before, to: r.after } },
    });
  });
}

export async function moveFileAction(
  fileId: string,
  space: "personal" | "team",
  folderId: string | null,
) {
  return run(async (v) => {
    const f = await moveFile(v, fileId, space, folderId);
    await audit({
      action: "file.moved",
      target: fileTarget(f),
      changes: {
        space: { from: f.space, to: space },
        folderId: { from: f.folderId, to: folderId },
      },
    });
  });
}

export async function setFileContactAction(fileId: string, contactId: string | null) {
  return run(async (v) => {
    const f = await setFileContact(v, fileId, contactId);
    await audit({
      action: "file.contact_set",
      target: fileTarget(f),
      changes: { contactId: { from: f.contactId, to: contactId } },
    });
    if (contactId && contactId !== f.contactId) {
      const { fileOnTimeline } = await import("@/server/drive");
      await fileOnTimeline(v.ws, f, contactId, { userId: v.userId });
    }
  });
}

export async function trashFileAction(fileId: string) {
  return run(async (v) => {
    const f = await trashFile(v, fileId);
    await audit({ action: "file.trashed", target: fileTarget(f) });
  });
}

export async function restoreFileAction(fileId: string) {
  return run(async (v) => {
    const f = await restoreFile(v, fileId);
    await audit({ action: "file.restored", target: fileTarget(f) });
  });
}

export async function purgeFileAction(fileId: string) {
  return run(async (v) => {
    const f = await purgeFile(v, fileId);
    await audit({
      action: "file.deleted",
      target: fileTarget(f),
      changes: { size: { to: f.size } },
    });
  });
}

export async function linkFileToTaskAction(fileId: string, taskId: string) {
  return run(async (v) => {
    const { file, task } = await linkFileToTask(v, fileId, taskId);
    await audit({
      action: "file.linked",
      target: fileTarget(file),
      changes: { task: { to: task.title } },
    });
  });
}

export async function unlinkFileFromTaskAction(fileId: string, taskId: string) {
  return run(async (v) => {
    const f = await unlinkFileFromTask(v, fileId, taskId);
    await audit({
      action: "file.unlinked",
      target: fileTarget(f),
      changes: { taskId: { from: taskId } },
    });
  });
}

export type ClientFile = {
  id: string;
  name: string;
  mime: string;
  size: number;
  contactName: string | null;
  ownerName: string | null;
  at: string;
};

const toClient = (f: DriveRow): ClientFile => ({
  id: f.id,
  name: f.name,
  mime: f.mime,
  size: f.size,
  contactName: f.contactName,
  ownerName: f.ownerName,
  at: (f.updatedAt ?? f.readyAt ?? f.createdAt).toISOString(),
});

/** The file picker (attach from the drive) and "Show more" in any list. */
export async function findFilesAction(opts: {
  q?: string;
  contactId?: string | null;
  space?: "personal" | "team";
  folderId?: string | null;
  cursor?: string | null;
}): Promise<{ files: ClientFile[]; next: string | null } | null> {
  // audit: read-only — lists files the member can see
  const v = await viewer();
  if (!v) return null;
  const cursor = decodeFileCursor(opts.cursor);
  const r = opts.q?.trim()
    ? await searchFiles(v, opts.q.trim(), cursor)
    : opts.contactId
      ? await listContactFiles(v, opts.contactId, "all", cursor)
      : opts.space
        ? await listFolder(v, opts.space, opts.folderId ?? null, cursor)
        : await listRecent(v, cursor);
  return { files: r.files.map(toClient), next: r.next };
}

/** Folders of a space, with their paths (the move dialog). */
export async function listFoldersAction(space: "personal" | "team") {
  // audit: read-only — folder names for the move dialog
  const v = await viewer();
  if (!v) return [];
  const { allFolders } = await import("@/server/drive");
  return allFolders(v, space);
}

/** Contacts by name or email (the "belongs to" dialog). */
export async function searchContactsAction(q: string) {
  // audit: read-only — contact search for the "belongs to" dialog
  const v = await viewer();
  if (!v) return [];
  const { listContacts } = await import("@/server/contacts");
  const list = await listContacts(v.ws.id, { q, limit: 20, viewer: v.userId });
  return list.map((c) => ({ id: c.id, name: c.name || c.email, email: c.email }));
}
