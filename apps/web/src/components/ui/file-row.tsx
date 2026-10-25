import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "cn";
import { FileTypeIcon, kindOf } from "./file-type-icon";

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
