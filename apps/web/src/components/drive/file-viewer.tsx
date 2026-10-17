"use client";

import { useState, type ReactNode } from "react";
import { DownloadIcon, ExternalLinkIcon, EyeIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { previewKind } from "@/lib/preview";
import { cn } from "@/lib/utils";

export type ViewableFile = { id: string; name: string; mime?: string | null };

const fileUrl = (id: string) => `/files/${id}`;
const downloadUrl = (id: string) => `/files/${id}?download=1`;

/** A large dialog showing an image or PDF, with "Open in new tab" and "Download". */
export function FileViewer({
  file,
  open,
  onOpenChange,
}: {
  file: ViewableFile;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const kind = previewKind(file);
  // The file streams from /files/<id>: say so until the browser has it.
  const [loaded, setLoaded] = useState(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[90dvh] w-[calc(100%-2rem)] max-w-6xl flex-col gap-3 sm:max-w-6xl">
        {/* Room on the right for the dialog's own close button. */}
        <DialogHeader className="flex-row flex-wrap items-center justify-between gap-2 pr-8">
          <DialogTitle className="min-w-0 truncate">{file.name}</DialogTitle>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<a href={fileUrl(file.id)} target="_blank" rel="noopener noreferrer" />}
            >
              <ExternalLinkIcon data-icon="inline-start" />
              Open in new tab
            </Button>
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<a href={downloadUrl(file.id)} />}
            >
              <DownloadIcon data-icon="inline-start" />
              Download
            </Button>
          </div>
        </DialogHeader>
        <div className="relative min-h-0 flex-1 overflow-hidden rounded-lg border bg-muted/30">
          {kind && !loaded && (
            <p
              className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-muted-foreground"
              role="status"
            >
              <Spinner /> Loading {file.name}…
            </p>
          )}
          {kind === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element -- a private file behind /files, not a static asset
            <img
              src={fileUrl(file.id)}
              alt={file.name}
              className="size-full object-contain"
              onLoad={() => setLoaded(true)}
              onError={() => setLoaded(true)}
            />
          ) : kind === "pdf" ? (
            <iframe
              src={fileUrl(file.id)}
              title={file.name}
              className="size-full bg-white"
              onLoad={() => setLoaded(true)}
            />
          ) : (
            <p className="p-6 text-sm text-muted-foreground">
              This type of file can&apos;t be shown here. Download it to open it.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * A file's name as a link: images and PDFs open in the viewer (a modified click still opens
 * the file in a new tab), anything else downloads.
 */
export function FileLink({
  file,
  className,
  children,
}: {
  file: ViewableFile;
  className?: string;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const kind = previewKind(file);
  return (
    <>
      <a
        href={kind ? fileUrl(file.id) : downloadUrl(file.id)}
        className={className}
        title={kind ? undefined : "Download (no preview for this type)"}
        onClick={(e) => {
          if (!kind || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
          e.preventDefault();
          setOpen(true);
        }}
      >
        {children ?? file.name}
      </a>
      {kind && open && <FileViewer file={file} open onOpenChange={setOpen} />}
    </>
  );
}

/** "View" (disabled, with the reason, when the type has no preview) and "Download" buttons. */
export function FileViewButtons({ file, className }: { file: ViewableFile; className?: string }) {
  const [open, setOpen] = useState(false);
  const kind = previewKind(file);
  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" disabled={!kind} onClick={() => setOpen(true)}>
          <EyeIcon data-icon="inline-start" />
          View
        </Button>
        {kind && (
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={<a href={fileUrl(file.id)} target="_blank" rel="noopener noreferrer" />}
          >
            <ExternalLinkIcon data-icon="inline-start" />
            Open in new tab
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          nativeButton={false}
          render={<a href={downloadUrl(file.id)} />}
        >
          <DownloadIcon data-icon="inline-start" />
          Download
        </Button>
      </div>
      {!kind && (
        <p className="text-xs text-muted-foreground">
          No preview for this type of file. Download it to open it.
        </p>
      )}
      {kind && open && <FileViewer file={file} open onOpenChange={setOpen} />}
    </div>
  );
}
