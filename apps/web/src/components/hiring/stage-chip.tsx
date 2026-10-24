import type { StageCategory } from "@bookly/db/schema";
import { cn } from "cn";
import { CATEGORY_LABELS } from "@/server/hiring/setup-text";

/** The tone on a stage's edge by category: open neutral, hold amber, won green, lost grey. */
export const CATEGORY_EDGE: Record<StageCategory, string> = {
  open: "border-l-border",
  hold: "border-l-warning",
  won: "border-l-success",
  lost: "border-l-muted-foreground",
};

/**
 * A stage as a chip: its name, with the category's tone on the left edge. Tone is never the only
 * signal: `withCategory` adds the category in words (screen readers always get it).
 */
export function StageChip({
  name,
  category,
  withCategory = false,
  className,
}: {
  name: string;
  category: StageCategory;
  withCategory?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-l-[3px] bg-background px-2 py-0.5 text-xs font-medium",
        CATEGORY_EDGE[category],
        className,
      )}
    >
      {name}
      {withCategory ? (
        <span className="text-muted-foreground">· {CATEGORY_LABELS[category]}</span>
      ) : (
        <span className="sr-only">({CATEGORY_LABELS[category]})</span>
      )}
    </span>
  );
}
