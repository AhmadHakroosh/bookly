"use client";

import { useRef, useState, useTransition } from "react";
import { ImageIcon, Trash2Icon, UploadIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

export type ImageUploadResult = { ok?: boolean; url?: string; error?: string };

/**
 * A picture with "Upload" and "Remove": choosing a file sends it to the upload action at once
 * and shows the result, so the surrounding form never has to carry the bytes. The preview shows
 * `initial` (the saved image) and then whatever the server returns; a URL typed into the form
 * is not previewed here, so nothing from the page's own text reaches the image. `onChange`
 * lets the form keep its URL field in step with uploads and removals.
 */
export function ImageUpload({
  initial,
  onChange,
  upload,
  remove,
  shape = "circle",
  label,
  hint,
  disabled,
}: {
  initial: string;
  onChange?: (url: string) => void;
  upload: (formData: FormData) => Promise<ImageUploadResult>;
  remove: () => Promise<ImageUploadResult>;
  shape?: "circle" | "square";
  label: string;
  hint?: string;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [current, setCurrent] = useState(initial);
  const apply = (r: ImageUploadResult) => {
    if (r.error) toast.error(r.error);
    else {
      setCurrent(r.url ?? "");
      onChange?.(r.url ?? "");
      toast.success(r.url ? `${label} updated` : `${label} removed`);
    }
  };
  return (
    <div className="flex items-center gap-4">
      <div
        className={cn(
          "flex size-20 shrink-0 items-center justify-center overflow-hidden border bg-muted",
          shape === "circle" ? "rounded-full" : "rounded-lg",
        )}
      >
        {current ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={current} alt="" className="size-full object-cover" />
        ) : (
          <ImageIcon className="size-7 text-muted-foreground" aria-hidden />
        )}
      </div>
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <input
            ref={input}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
            className="sr-only"
            aria-label={`Choose ${label.toLowerCase()}`}
            disabled={disabled || pending}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              const fd = new FormData();
              fd.set("file", file);
              start(async () => apply(await upload(fd)));
            }}
          />
          <Button
            type="button"
            variant="outline"
            disabled={disabled || pending}
            aria-busy={pending}
            onClick={() => input.current?.click()}
          >
            {pending ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <UploadIcon data-icon="inline-start" />
            )}
            {pending
              ? "Uploading…"
              : current
                ? `Replace ${label.toLowerCase()}`
                : `Upload ${label.toLowerCase()}`}
          </Button>
          {current && (
            <Button
              type="button"
              variant="ghost"
              disabled={disabled || pending}
              onClick={() => start(async () => apply(await remove()))}
            >
              <Trash2Icon data-icon="inline-start" />
              Remove
            </Button>
          )}
        </div>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
}
