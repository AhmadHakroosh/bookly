"use client";

import { EXT } from "@/lib/files";

/*
 * Browser side of a drive upload: announce the file (the server checks the plan, the quota,
 * the type and where it goes), PUT the bytes straight to the bucket (or the app's own route on
 * the local driver) with progress, then confirm. Used by the drive, tasks, contacts and emails.
 */

export type DriveTarget = {
  space?: "personal" | "team";
  folderId?: string | null;
  contactId?: string | null;
  taskId?: string | null;
};

export type Uploaded = { id: string; name: string; size: number; mime: string };

const BY_EXT: Record<string, string> = {
  ...Object.fromEntries(Object.entries(EXT).map(([mime, ext]) => [ext, mime])),
  jpeg: "image/jpeg",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

/** The browser's type, or one guessed from the extension when it gives none. */
export const mimeOf = (f: File) =>
  f.type || BY_EXT[f.name.split(".").pop()?.toLowerCase() ?? ""] || "application/octet-stream";

function put(
  url: string,
  headers: Record<string, string>,
  file: File,
  onProgress?: (p: number) => void,
) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Upload failed (${xhr.status}).`));
    xhr.onerror = () => reject(new Error("Upload failed. Check your connection."));
    xhr.send(file);
  });
}

export async function uploadToDrive(
  file: File,
  target: DriveTarget,
  onProgress?: (p: number) => void,
): Promise<Uploaded> {
  const start = await fetch("/api/uploads", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      kind: "attachment",
      name: file.name,
      mime: mimeOf(file),
      size: file.size,
      drive: target,
    }),
  });
  const ticket = await start.json().catch(() => ({}));
  if (!start.ok) throw new Error(ticket.error ?? "Could not start the upload.");
  await put(ticket.upload.url, ticket.upload.headers ?? {}, file, onProgress);
  const done = await fetch(`/api/uploads/${ticket.id}/complete`, { method: "POST" });
  const body = await done.json().catch(() => ({}));
  if (!done.ok) throw new Error(body.error ?? "Could not finish the upload.");
  return { id: body.id, name: body.name, size: body.size, mime: body.mime };
}

export function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}
