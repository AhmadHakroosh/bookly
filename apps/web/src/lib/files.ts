import type { FileKind, FileVisibility } from "@bookly/db/schema";

/*
 * The rules and URL helpers for uploaded files, kept free of server imports so forms, emails
 * and tests can use them; the storage work itself is in `server/files.ts`.
 */

export const MB = 1024 ** 2;
const IMAGE_MIMES = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"];

export const FILE_RULES: Record<
  FileKind,
  { maxBytes: number; mimes: string[]; visibility: FileVisibility; label: string }
> = {
  avatar: { maxBytes: 8 * MB, mimes: IMAGE_MIMES, visibility: "public", label: "Profile photo" },
  logo: { maxBytes: 8 * MB, mimes: IMAGE_MIMES, visibility: "public", label: "Logo" },
  background: { maxBytes: 12 * MB, mimes: IMAGE_MIMES, visibility: "public", label: "Background" },
  attachment: {
    maxBytes: 50 * MB,
    mimes: [
      ...IMAGE_MIMES,
      "application/pdf",
      "text/plain",
      "text/csv",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "application/zip",
      "audio/mpeg",
      "audio/mp4",
      "video/mp4",
      "video/quicktime",
      "video/webm",
    ],
    visibility: "private",
    label: "Attachment",
  },
};

/** How long a presigned upload may stay unconfirmed before the sweep removes it. */
export const PENDING_UPLOAD_TTL_MS = 24 * 3600_000;

export type UploadCheck = { ok: true } | { ok: false; error: string };

/** The allow-list and size cap for a kind, phrased for the person uploading. */
export function checkUpload(kind: FileKind, mime: string, size: number, name = ""): UploadCheck {
  const rule = FILE_RULES[kind];
  if (!rule) return { ok: false, error: "Unknown file kind." };
  if (!Number.isFinite(size) || size <= 0) return { ok: false, error: "The file is empty." };
  if (size > rule.maxBytes)
    return {
      ok: false,
      error: `${rule.label}s can be up to ${Math.round(rule.maxBytes / MB)} MB.`,
    };
  if (!rule.mimes.includes(mime.toLowerCase()))
    return {
      ok: false,
      error:
        kind === "attachment"
          ? "That file type is not allowed."
          : `Use a PNG, JPEG, WebP, GIF or AVIF image${name ? ` (${name} is ${mime || "unknown"})` : ""}.`,
    };
  return { ok: true };
}

export const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
  "application/pdf": "pdf",
  "text/plain": "txt",
  "text/csv": "csv",
  "application/zip": "zip",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};
export const extFor = (mime: string, name: string) =>
  EXT[mime] ?? name.match(/\.([a-z0-9]{1,5})$/i)?.[1]?.toLowerCase() ?? "bin";

export const keyFor = (wsId: string, kind: FileKind, id: string, ext: string) =>
  `ws/${wsId}/${kind}/${id}.${ext}`;

/** Where the app serves a file from (relative; `absoluteFileUrl` for emails and APIs). */
export const fileUrl = (id: string) => `/files/${id}`;

/** `/files/<id>` → `https://host/files/<id>`; URLs that are already absolute pass through. */
export const absoluteFileUrl = (url: string | null | undefined, base: string) =>
  url && url.startsWith("/") ? `${base}${url}` : (url ?? null);

/** The file id behind a `/files/<id>` URL, or null for any other URL. */
export const fileIdFromUrl = (url: string | null | undefined) =>
  url?.match(/^\/files\/([0-9a-f-]{36})$/i)?.[1] ?? null;
