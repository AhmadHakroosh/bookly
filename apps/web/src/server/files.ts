import "server-only";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { and, eq, inArray, lt, schema } from "@bookly/db";
import type { FileKind, FileVisibility, StoredFile, Workspace } from "@bookly/db/schema";
import { getStorage } from "@bookly/storage";
import { db } from "@/lib/db";
import { audit, type AuditActor } from "./audit";
import { assertStorageQuota } from "./limits";
import { baseUrl } from "./scheduling";
import {
  FILE_RULES,
  PENDING_UPLOAD_TTL_MS,
  absoluteFileUrl as absolute,
  checkUpload,
  extFor,
  keyFor,
} from "@/lib/files";

/*
 * Uploaded files: the rules per kind, the two ways bytes get in (images through the server,
 * resized once; everything else straight to the bucket with a presigned PUT), and the cleanup
 * that keeps the bucket and the `files` table in step. Permissions and quotas are checked here,
 * never in the storage driver.
 */

export {
  FILE_RULES,
  PENDING_UPLOAD_TTL_MS,
  checkUpload,
  fileIdFromUrl,
  fileUrl,
  type UploadCheck,
} from "@/lib/files";

/** `absoluteFileUrl` with this deployment's base URL filled in. */
export const absoluteFileUrl = (url: string | null | undefined, base = baseUrl()) =>
  absolute(url, base);

export type FileOwner = { type: string; id: string };

/* ---------------- Images through the server ---------------- */

const IMAGE_SIZES: Record<
  Exclude<FileKind, "attachment">,
  { width: number; height: number; fit: "cover" | "inside" }
> = {
  avatar: { width: 512, height: 512, fit: "cover" },
  logo: { width: 1024, height: 1024, fit: "inside" },
  background: { width: 1920, height: 1920, fit: "inside" },
};

/**
 * Stores an avatar, logo or background: decoded and resized once (auto-rotated, metadata
 * stripped), kept as PNG when it has transparency and JPEG otherwise, then written to storage
 * and recorded. A previous file for the same owner and kind is removed. Throws a LimitError
 * when the plan's storage is full.
 */
export async function storeImage(opts: {
  ws: Workspace;
  kind: Exclude<FileKind, "attachment">;
  input: Buffer;
  name: string;
  mime: string;
  userId: string | null;
  owner: FileOwner;
  actor?: AuditActor;
}): Promise<StoredFile> {
  const check = checkUpload(opts.kind, opts.mime, opts.input.length, opts.name);
  if (!check.ok) throw new Error(check.error);
  const size = IMAGE_SIZES[opts.kind];
  // A pixel bomb (tiny file, enormous dimensions) is refused before decoding.
  let out: Buffer;
  let alpha = false;
  try {
    const image = sharp(opts.input, { limitInputPixels: 40e6, animated: false }).rotate();
    const meta = await image.metadata();
    if (!meta.format || !["png", "jpeg", "webp", "gif", "avif", "heif"].includes(meta.format))
      throw new Error("not an image");
    alpha = !!meta.hasAlpha && meta.format !== "jpeg";
    const resized = image.resize({ ...size, withoutEnlargement: true });
    out = alpha
      ? await resized.png({ compressionLevel: 9 }).toBuffer()
      : await resized.jpeg({ quality: 85, mozjpeg: true }).toBuffer();
  } catch {
    // Truncated, corrupt or mislabelled files: libvips' message is not for people.
    throw new Error("That image could not be read. Try exporting it again as PNG or JPEG.");
  }
  const mime = alpha ? "image/png" : "image/jpeg";
  const id = crypto.randomUUID();
  const key = keyFor(opts.ws.id, opts.kind, id, alpha ? "png" : "jpg");
  await assertStorageQuota(opts.ws, out.length);
  await getStorage().put(key, out, { contentType: mime });
  const [row] = await db()
    .insert(schema.files)
    .values({
      id,
      workspaceId: opts.ws.id,
      kind: opts.kind,
      key,
      name: opts.name.slice(0, 200) || `${opts.kind}.${alpha ? "png" : "jpg"}`,
      mime,
      size: out.length,
      sha256: createHash("sha256").update(out).digest("hex"),
      visibility: FILE_RULES[opts.kind].visibility,
      status: "ready",
      readyAt: new Date(),
      uploadedBy: opts.userId,
      ownerType: opts.owner.type,
      ownerId: opts.owner.id,
    })
    .returning();
  await replaceOwnersFile(opts.ws.id, opts.kind, opts.owner, id);
  await audit({
    workspace: opts.ws.id,
    actor: opts.actor,
    action: "file.uploaded",
    target: { type: "file", id, label: row!.name },
    changes: {
      kind: { to: opts.kind },
      size: { to: out.length },
      owner: { to: `${opts.owner.type} ${opts.owner.id}` },
    },
  });
  return row!;
}

/** Removes every other file of this kind for the owner (an avatar replaces the last avatar). */
async function replaceOwnersFile(wsId: string, kind: FileKind, owner: FileOwner, keepId: string) {
  const old = await db().query.files.findMany({
    where: and(
      eq(schema.files.workspaceId, wsId),
      eq(schema.files.kind, kind),
      eq(schema.files.ownerType, owner.type),
      eq(schema.files.ownerId, owner.id),
    ),
  });
  for (const f of old) if (f.id !== keepId) await removeFile(f, { silent: true });
}

/* ---------------- Large files straight to storage ---------------- */

export type UploadTicket = {
  file: StoredFile;
  upload: { method: "PUT"; url: string; headers: Record<string, string>; expiresAt: string };
};

/**
 * Reserves a file row and returns where the browser should PUT the bytes: a presigned bucket
 * URL on S3, the app's own upload route on the local driver. Call `completeUpload` after.
 */
export async function createUpload(opts: {
  ws: Workspace;
  kind: FileKind;
  name: string;
  mime: string;
  size: number;
  userId: string | null;
  owner?: FileOwner;
  visibility?: FileVisibility;
  /** Drive placement, already resolved and permission-checked by the caller (server/drive.ts). */
  drive?: {
    space: "personal" | "team" | "contact";
    folderId: string | null;
    contactId: string | null;
    source: "upload" | "task";
    sourceId: string | null;
  };
}): Promise<UploadTicket> {
  const check = checkUpload(opts.kind, opts.mime, opts.size, opts.name);
  if (!check.ok) throw new Error(check.error);
  await assertStorageQuota(opts.ws, opts.size);
  const id = crypto.randomUUID();
  const key = keyFor(opts.ws.id, opts.kind, id, extFor(opts.mime, opts.name));
  const [file] = await db()
    .insert(schema.files)
    .values({
      id,
      workspaceId: opts.ws.id,
      kind: opts.kind,
      key,
      name: opts.name.slice(0, 200) || "file",
      mime: opts.mime,
      size: opts.size,
      visibility: opts.visibility ?? FILE_RULES[opts.kind].visibility,
      status: "pending",
      uploadedBy: opts.userId,
      ownerType: opts.owner?.type ?? null,
      ownerId: opts.owner?.id ?? null,
      ...(opts.drive ?? {}),
    })
    .returning();
  const storage = getStorage();
  if (storage.presign) {
    const p = await storage.presignPut(key, { contentType: opts.mime, contentLength: opts.size });
    return {
      file: file!,
      upload: {
        method: "PUT",
        url: p.url,
        headers: p.headers,
        expiresAt: p.expiresAt.toISOString(),
      },
    };
  }
  return {
    file: file!,
    upload: {
      method: "PUT",
      url: `/api/uploads/${id}`,
      headers: { "content-type": opts.mime },
      expiresAt: new Date(Date.now() + PENDING_UPLOAD_TTL_MS).toISOString(),
    },
  };
}

/** The local driver's half of `createUpload`: the app receives the bytes itself. */
export async function receiveUpload(ws: Pick<Workspace, "id">, id: string, body: Buffer) {
  const file = await getFile(ws, id);
  if (!file || file.status !== "pending") throw new Error("Unknown upload.");
  if (body.length !== file.size) throw new Error("The upload is not the size that was announced.");
  await getStorage().put(file.key, body, {
    contentType: file.mime,
    cacheControl: "private, max-age=0",
  });
  return file;
}

/** Confirms the bytes are in place and the size matches, then marks the file ready. */
export async function completeUpload(
  ws: Workspace,
  id: string,
  opts: { actor?: AuditActor } = {},
): Promise<StoredFile> {
  const file = await getFile(ws, id);
  if (!file) throw new Error("Unknown upload.");
  if (file.status === "ready") return file;
  const head = await getStorage().head(file.key);
  if (!head) throw new Error("The file has not been uploaded yet.");
  if (head.size !== file.size) {
    await removeFile(file, { silent: true });
    throw new Error("The upload is not the size that was announced.");
  }
  const [row] = await db()
    .update(schema.files)
    .set({ status: "ready", readyAt: new Date() })
    .where(eq(schema.files.id, id))
    .returning();
  await audit({
    workspace: ws.id,
    actor: opts.actor,
    action: "file.uploaded",
    target: { type: "file", id, label: file.name },
    changes: { kind: { to: file.kind }, size: { to: file.size } },
  });
  return row!;
}

/* ---------------- Reading, deleting, sweeping ---------------- */

export async function getFile(ws: Pick<Workspace, "id">, id: string): Promise<StoredFile | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  return (
    (await db().query.files.findFirst({
      where: and(eq(schema.files.id, id), eq(schema.files.workspaceId, ws.id)),
    })) ?? null
  );
}

/** Any workspace's file by id (public avatars and logos are served on any host). */
export async function getFileAnywhere(id: string): Promise<StoredFile | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  return (await db().query.files.findFirst({ where: eq(schema.files.id, id) })) ?? null;
}

/** A short-lived direct download URL (S3) or null when the app must stream it (local). */
export async function downloadUrl(
  file: StoredFile,
  disposition: "inline" | "attachment" = "attachment",
): Promise<string | null> {
  const storage = getStorage();
  if (!storage.presign) return null;
  return storage.presignGet(file.key, { filename: file.name, contentType: file.mime, disposition });
}

export async function removeFile(
  file: StoredFile,
  opts: { silent?: boolean; actor?: AuditActor } = {},
) {
  await getStorage()
    .delete(file.key)
    .catch((e) => console.error("[files] delete", file.key, e));
  await db().delete(schema.files).where(eq(schema.files.id, file.id));
  if (!opts.silent)
    await audit({
      workspace: file.workspaceId,
      actor: opts.actor,
      action: "file.deleted",
      target: { type: "file", id: file.id, label: file.name },
      changes: { kind: { to: file.kind }, size: { to: file.size } },
    });
}

/** Pending uploads that were never confirmed are dropped after a day (called from the tick). */
export async function sweepPendingFiles(now = new Date()): Promise<number> {
  const stale = await db().query.files.findMany({
    where: and(
      eq(schema.files.status, "pending"),
      lt(schema.files.createdAt, new Date(now.getTime() - PENDING_UPLOAD_TTL_MS)),
    ),
  });
  for (const f of stale) await removeFile(f, { silent: true });
  return stale.length;
}

/** Every object of a workspace, before its rows cascade away with the workspace. */
export async function deleteWorkspaceFiles(wsId: string) {
  const rows = await db().query.files.findMany({ where: eq(schema.files.workspaceId, wsId) });
  const storage = getStorage();
  for (const f of rows) await storage.delete(f.key).catch(() => {});
  if (rows.length)
    await db()
      .delete(schema.files)
      .where(
        inArray(
          schema.files.id,
          rows.map((r) => r.id),
        ),
      );
}
