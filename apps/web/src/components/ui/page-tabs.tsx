import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "cn";

export type PageTab = { href: string; label: ReactNode; active?: boolean; count?: number | null };

/**
 * A page's own sections as the concepts draw them ("Weekly hours · Date overrides · Priority
 * rules · Routing", "General · Integrations · API · Privacy"): links under the header on a
 * hairline, the current one orange and underlined. Each tab is an address, so a reload or a
 * shared link lands on the same tab. Scrolls sideways on a phone rather than wrapping.
 */
function PageTabs({
  items,
  label,
  className,
  aside,
}: {
  items: PageTab[];
  /** Names the set for screen readers: "Availability". */
  label: string;
  className?: string;
  /** Right of the tabs, on the same line: counts such as "24 applications · 8 reviews pending". */
  aside?: ReactNode;
}) {
  return (
    <div
      data-slot="page-tabs"
      className={cn("flex flex-wrap items-end justify-between gap-x-6 gap-y-2 border-b", className)}
    >
      <nav aria-label={label} className="-mb-px flex [scrollbar-width:none] gap-1 overflow-x-auto">
        {items.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            aria-current={t.active ? "page" : undefined}
            className={cn(
              "border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              t.active
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
            {t.count != null && <span className="ms-1 tabular-nums">({t.count})</span>}
          </Link>
        ))}
      </nav>
      {aside && <div className="pb-2 text-sm text-muted-foreground">{aside}</div>}
    </div>
  );
}

export { PageTabs };
