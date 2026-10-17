"use client";

import { useState } from "react";
import { PaperclipIcon, XIcon } from "lucide-react";
import type { ClientFile } from "@/app/(admin)/admin/files/actions";
import { FilePicker } from "@/components/drive/file-picker";
import { UploadButton } from "@/components/drive/upload-button";
import { formatSize } from "@/lib/upload-client";

/**
 * Files to send with an email: picked from the drive or uploaded into the contact's folder.
 * Each one becomes a hidden `fileId` input of the surrounding form; the server sends them as
 * attachments while they fit (10 MB) and as 7-day links after that.
 */
export function AttachFiles({ contactId }: { contactId: string }) {
  const [files, setFiles] = useState<{ id: string; name: string; size: number }[]>([]);
  const add = (more: { id: string; name: string; size: number }[]) =>
    setFiles((prev) => [...prev, ...more.filter((m) => !prev.some((p) => p.id === m.id))]);
  return (
    <div className="space-y-2">
      {files.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Files to send">
          {files.map((f) => (
            <li
              key={f.id}
              className="inline-flex items-center gap-1 rounded-full border bg-muted/40 py-0.5 pr-1 pl-2 text-xs"
            >
              <PaperclipIcon className="size-3" aria-hidden />
              {f.name} · {formatSize(f.size)}
              <input type="hidden" name="fileId" value={f.id} />
              <button
                type="button"
                className="rounded-full p-0.5 hover:bg-muted"
                aria-label={`Don't send ${f.name}`}
                onClick={() => setFiles((prev) => prev.filter((p) => p.id !== f.id))}
              >
                <XIcon className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <FilePicker
          label="Attach from Files"
          contactId={contactId}
          exclude={files.map((f) => f.id)}
          onPick={(picked: ClientFile[]) => add(picked)}
        />
        <UploadButton
          target={{ contactId }}
          variant="outline"
          size="sm"
          label="Upload"
          onUploaded={(up) => add(up.map((u) => ({ id: u.id, name: u.name, size: u.size })))}
        />
      </div>
    </div>
  );
}
