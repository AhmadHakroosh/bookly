"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { UploadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { uploadToDrive, type DriveTarget, type Uploaded } from "@/lib/upload-client";

/**
 * "Upload" for the drive, a task or a contact: picks one or more files, uploads them one after
 * another with progress, then refreshes the page (or hands the files to `onUploaded`).
 */
export function UploadButton({
  target,
  label = "Upload",
  variant = "default",
  size = "default",
  onUploaded,
}: {
  target: DriveTarget;
  label?: string;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm";
  onUploaded?: (files: Uploaded[]) => void;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const pick = async (list: FileList | null) => {
    if (!list?.length) return;
    const done: Uploaded[] = [];
    for (const [i, file] of [...list].entries()) {
      try {
        done.push(
          await uploadToDrive(file, target, (p) =>
            setProgress(
              `${list.length > 1 ? `${i + 1}/${list.length} · ` : ""}${Math.round(p * 100)}%`,
            ),
          ),
        );
      } catch (e) {
        toast.error(`${file.name}: ${(e as Error).message}`);
      }
    }
    setProgress(null);
    if (input.current) input.current.value = "";
    if (done.length) {
      toast.success(
        done.length === 1 ? `${done[0]!.name} uploaded` : `${done.length} files uploaded`,
      );
      onUploaded?.(done);
      router.refresh();
    }
  };
  return (
    <>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        onChange={(e) => pick(e.target.files)}
        aria-label={label}
      />
      <Button
        type="button"
        variant={variant}
        size={size}
        disabled={!!progress}
        onClick={() => input.current?.click()}
      >
        <UploadIcon data-icon="inline-start" />
        {progress ? `Uploading ${progress}` : label}
      </Button>
    </>
  );
}
