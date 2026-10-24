import Link from "next/link";
import type { ReactNode } from "react";
import {
  FileArchiveIcon,
  FileIcon,
  FileImageIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
} from "lucide-react";
import { cn } from "cn";

/** The file's kind from its name or type, for the coloured icon the concepts give every file. */
function kindOf(nameOrMime: string) {
  const s = nameOrMime.toLowerCase();
  if (/pdf$/.test(s)) return "pdf";
  if (/(xlsx?|csv|spreadsheet)$/.test(s)) return "sheet";
  if (/(docx?|txt|md|wordprocessing|text\/plain)$/.test(s)) return "doc";
  if (/(png|jpe?g|gif|webp|avif|svg|image\/.*)$/.test(s)) return "image";
  if (/(zip|rar|7z|tar|gz)$/.test(s)) return "archive";
  return "file";
}

const KINDS = {
  pdf: { icon: FileTextIcon, cls: "text-destructive" },
  doc: { icon: FileTextIcon, cls: "text-info" },
  sheet: { icon: FileSpreadsheetIcon, cls: "text-success" },
  image: { icon: FileImageIcon, cls: "text-brand" },
  archive: { icon: FileArchiveIcon, cls: "text-warning" },
  file: { icon: FileIcon, cls: "text-muted-foreground" },
} as const;

/** proposal.pdf in red, notes.docx in blue, timeline.xlsx in green: as `ui mocks.png` 06. */
function FileTypeIcon({ name, className }: { name: string; className?: string }) {
  const k = KINDS[kindOf(name)];
  return <k.icon className={cn("size-4 shrink-0", k.cls, className)} aria-hidden />;
}

/**
 * A file in a list ("Recent files" on a contact, a task's attachments): its icon, name, one line
 * about it, and the date on the right. The name opens it.
 */
function FileRow({
  name,
  href,
  meta,
  date,
  actions,
  className,
}: {
  name: string;
  href?: string;
  meta?: ReactNode;
  date?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div data-slot="file-row" className={cn("flex items-center gap-3 py-2 text-sm", className)}>
      <FileTypeIcon name={name} />
      <div className="min-w-0 flex-1">
        {href ? (
          <Link href={href} className="block truncate font-medium hover:underline">
            {name}
          </Link>
        ) : (
          <span className="block truncate font-medium">{name}</span>
        )}
        {meta && <span className="block truncate text-xs text-muted-foreground">{meta}</span>}
      </div>
      {date && <span className="shrink-0 text-xs text-muted-foreground">{date}</span>}
      {actions}
    </div>
  );
}

export { FileRow, FileTypeIcon, kindOf };
