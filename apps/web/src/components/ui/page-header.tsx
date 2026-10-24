import type { ReactNode } from "react";
import { cn } from "cn";

/**
 * The top of every admin page: the title (a noun, the page's only `h1`), an optional badge or
 * status chip beside it, one line of context below, and at most two actions on the right: an
 * outline one ("View booking page") and the primary one ("New booking"). See DESIGN.md.
 */
function PageHeader({
  title,
  description,
  badge,
  actions,
  className,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  /** Beside the title: `BetaBadge`, a `StatusChip`. */
  badge?: ReactNode;
  actions?: ReactNode;
  className?: string;
  /** Below the description, full width: tabs or a `StatStrip` that belong to the header. */
  children?: ReactNode;
}) {
  return (
    <div data-slot="page-header" className={cn("space-y-4", className)}>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 space-y-1">
          <h1 className="flex flex-wrap items-center gap-x-3 gap-y-1 text-2xl font-semibold tracking-tight text-balance md:text-[1.75rem] md:leading-9">
            {title}
            {badge}
          </h1>
          {description && <div className="text-sm text-muted-foreground">{description}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

export { PageHeader };
