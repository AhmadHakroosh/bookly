"use client";

import Link from "next/link";
import { useId, type ReactNode } from "react";
import { cn } from "cn";
import { Checkbox } from "@/components/ui/checkbox";

/**
 * A task as a row with its checkbox ("Your next steps" on Home, linked tasks on a contact): the
 * title, who and what it is for, and when it is due, in orange when it is today or late.
 */
function ChecklistRow({
  title,
  meta,
  due,
  urgent = false,
  checked,
  onCheckedChange,
  href,
  className,
}: {
  title: ReactNode;
  /** "Priya Shah • Northstar Studio". */
  meta?: ReactNode;
  /** "Due today", "Due Thu, Oct 29". */
  due?: ReactNode;
  /** Due today or overdue: the date turns orange. */
  urgent?: boolean;
  checked: boolean;
  onCheckedChange?: (checked: boolean) => void;
  /** Opens the task. */
  href?: string;
  className?: string;
}) {
  const id = useId();
  return (
    <div
      data-slot="checklist-row"
      className={cn("flex min-w-0 items-start gap-3 py-2.5", className)}
    >
      <Checkbox
        aria-labelledby={id}
        checked={checked}
        onCheckedChange={(v) => onCheckedChange?.(v === true)}
        className="mt-0.5 size-5 rounded-md [&_svg]:size-4"
      />
      <div className="min-w-0 flex-1">
        <p
          id={id}
          className={cn("text-sm font-medium", checked && "text-muted-foreground line-through")}
        >
          {href ? (
            <Link href={href} className="hover:underline">
              {title}
            </Link>
          ) : (
            title
          )}
        </p>
        {meta && <p className="truncate text-xs text-muted-foreground">{meta}</p>}
      </div>
      {due && (
        <span
          className={cn(
            "shrink-0 text-xs",
            urgent ? "font-medium text-warning" : "text-muted-foreground",
          )}
        >
          {due}
        </span>
      )}
    </div>
  );
}

export { ChecklistRow };
