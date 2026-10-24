import type { ComponentType, ReactNode, SVGProps } from "react";
import { cn } from "cn";

/**
 * What a list shows before it has anything: an icon in the mark's speech bubble (Peach, Bookly
 * Orange), a short title that says what will be here, one line on how it gets filled, and the
 * action that fills it. Copy rules in DESIGN.md: say what to do next, no "Oops".
 */
function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  size = "default",
  className,
}: {
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
  title: ReactNode;
  description?: ReactNode;
  /** A `Button` (or two): the way out of empty. */
  action?: ReactNode;
  /** `sm` inside a card or a column, `default` for a page's main list. */
  size?: "sm" | "default";
  className?: string;
}) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        "flex flex-col items-center rounded-xl border border-dashed text-center",
        size === "sm" ? "gap-2 px-4 py-6" : "gap-3 px-6 py-12",
        className,
      )}
    >
      {Icon && (
        <span
          className={cn(
            "flex items-center justify-center rounded-2xl rounded-bl-sm bg-accent text-brand",
            size === "sm" ? "mb-1 size-9" : "mb-1 size-12",
          )}
          aria-hidden
        >
          <Icon className={size === "sm" ? "size-4" : "size-6"} />
        </span>
      )}
      <p className={cn("font-semibold text-balance", size === "sm" ? "text-sm" : "text-base")}>
        {title}
      </p>
      {description && (
        <div className="max-w-sm text-sm text-pretty text-muted-foreground">{description}</div>
      )}
      {action && <div className="mt-1 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

export { EmptyState };
