import type { ReactNode } from "react";
import { cn } from "cn";

/**
 * A day as a timeline: times down the left on a rail, one card per meeting. The current or
 * next meeting is `active`: an orange dot and a Peach card, with room below for "Pick up where
 * you left off". Items are list items in time order, so a screen reader hears them in sequence.
 */
function Agenda({ className, ...props }: React.ComponentProps<"ol">) {
  return <ol data-slot="agenda" className={cn("flex flex-col", className)} {...props} />;
}

function AgendaItem({
  time,
  end,
  dateTime,
  active = false,
  title,
  subtitle,
  badge,
  meta,
  actions,
  className,
  children,
}: {
  /** Start, already formatted in the viewer's timezone ("09:30"). */
  time: ReactNode;
  end?: ReactNode;
  /** ISO start for the `<time>` element. */
  dateTime?: string;
  active?: boolean;
  title: ReactNode;
  /** "Maya Chen / Northstar project". */
  subtitle?: ReactNode;
  /** A `StatusChip` beside the title: "In 15 min", "New lead". */
  badge?: ReactNode;
  /** The small line: conferencing, length, people. */
  meta?: ReactNode;
  /** Join, Open briefing: stacked on the right, below the content on a phone. */
  actions?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <li
      data-slot="agenda-item"
      data-active={active || undefined}
      className={cn(
        // The rail: from this dot down to the next one.
        "relative grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-3 pb-3 last:pb-0",
        "before:absolute before:start-[4.5px] before:top-6 before:bottom-0 before:w-px before:bg-border last:before:hidden",
        className,
      )}
    >
      <div className="relative ps-5 pt-4">
        <span
          className={cn(
            "absolute start-0 top-[1.3rem] size-2.5 rounded-full",
            active ? "bg-brand ring-4 ring-brand/15" : "bg-muted-foreground/40",
          )}
          aria-hidden
        />
        <time dateTime={dateTime} className="block text-sm font-semibold tabular-nums">
          {time}
        </time>
        {end && (
          <span className="block text-xs text-muted-foreground tabular-nums">
            <span aria-hidden>– </span>
            <span className="sr-only">until </span>
            {end}
          </span>
        )}
      </div>
      <div
        className={cn(
          "flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-start",
          active
            ? "border-brand/30 bg-[color-mix(in_oklch,var(--accent)_55%,var(--card))]"
            : "bg-card",
        )}
      >
        <div className="min-w-0 flex-1 space-y-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-semibold">
            {title}
            {badge}
          </p>
          {subtitle && <div className="text-sm text-muted-foreground">{subtitle}</div>}
          {meta && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-xs text-muted-foreground">
              {meta}
            </div>
          )}
          {children && <div className="pt-2">{children}</div>}
        </div>
        {actions && (
          <div className="flex shrink-0 flex-wrap gap-2 sm:flex-col sm:items-stretch">
            {actions}
          </div>
        )}
      </div>
    </li>
  );
}

export { Agenda, AgendaItem };
