"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { FileIcon, XIcon } from "lucide-react";
import { linkFileToTaskAction, unlinkFileFromTaskAction } from "@/app/(admin)/admin/files/actions";
import { FileLink } from "@/components/drive/file-viewer";
import { FilePicker } from "@/components/drive/file-picker";
import { UploadButton } from "@/components/drive/upload-button";
import { Button } from "@/components/ui/button";
import { formatSize } from "@/lib/upload-client";

/**
 * Files on a task: upload (they also land in the drive, and in the contact's folder when the
 * task has one) or link files already in the drive; each links back to its file.
 */
export function TaskFiles({
  taskId,
  contactId,
  files,
}: {
  taskId: string;
  contactId: string | null;
  files: { id: string; name: string; mime: string; size: number }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const link = (ids: string[]) =>
    start(async () => {
      for (const id of ids) {
        const r = await linkFileToTaskAction(id, taskId);
        if (r.error) toast.error(r.error);
      }
      router.refresh();
    });
  const unlink = (id: string) =>
    start(async () => {
      const r = await unlinkFileFromTaskAction(id, taskId);
      if (r.error) toast.error(r.error);
      router.refresh();
    });
  return (
    <section aria-labelledby="task-files" className="space-y-3 border-t pt-5">
      <h2 id="task-files" className="text-base font-semibold tracking-tight">
        Files
      </h2>
      {files.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No files yet.
          {contactId ? " Files added here also go into the contact's folder and timeline." : ""}
        </p>
      ) : (
        <ul
          className="divide-y rounded-lg border text-sm"
          aria-label="Task files"
          aria-busy={pending}
        >
          {files.map((f) => (
            <li key={f.id} className="flex items-center gap-2 px-3 py-2">
              <FileIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <FileLink file={f} className="min-w-0 flex-1 truncate hover:underline" />
              <span className="text-xs text-muted-foreground">{formatSize(f.size)}</span>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove ${f.name} from this task`}
                onClick={() => unlink(f.id)}
              >
                <XIcon />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <UploadButton target={{ taskId }} variant="outline" size="sm" label="Upload" />
        <FilePicker
          contactId={contactId}
          exclude={files.map((f) => f.id)}
          onPick={(picked) => link(picked.map((f) => f.id))}
        />
      </div>
    </section>
  );
}
