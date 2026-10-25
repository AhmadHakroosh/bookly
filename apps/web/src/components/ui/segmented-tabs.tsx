import Link from "next/link";
import { cn } from "cn";

export type SegmentedTab = { href: string; label: string; count?: number; active?: boolean };

/**
 * Pill tabs that switch a list's view, with counts, as the concepts draw "Upcoming (4) · Past ·
 * Requests (1)" and "Mine (6) · All (12) · Completed (8)". Each is a link, so the view is in the
 * address; the current one is Peach with an orange outline.
 */
function SegmentedTabs({
  items,
  label,
  className,
}: {
  items: SegmentedTab[];
  /** Names the set for screen readers: "Bookings view". */
  label: string;
  className?: string;
}) {
  return (
    <nav aria-label={label} className={cn("flex flex-wrap gap-2", className)}>
      {items.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={t.active ? "page" : undefined}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
            t.active
              ? "border-primary/40 bg-accent text-accent-foreground"
              : "bg-card text-muted-foreground hover:text-foreground",
          )}
        >
          {t.label}
          {t.count !== undefined && <span className="tabular-nums">({t.count})</span>}
        </Link>
      ))}
    </nav>
  );
}

export { SegmentedTabs };
