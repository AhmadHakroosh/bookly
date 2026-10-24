import type { ReactNode, Ref } from "react";
import { cn } from "cn";

/**
 * Boards: tasks by status today, applications by stage in hiring. A board scrolls sideways;
 * each column is a labelled region with its name, a count and an optional menu; cards are list
 * items. Dragging stays with the caller (dnd-kit on the task board): these are the looks.
 */
function KanbanBoard({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="kanban-board"
      className={cn("flex items-start gap-3 overflow-x-auto pb-2", className)}
      {...props}
    />
  );
}

function KanbanColumn({
  title,
  count,
  countLabel,
  countTone = "default",
  color,
  actions,
  footer,
  highlight = false,
  ref,
  className,
  children,
}: {
  /** The column's name, also its region label. */
  title: string;
  count?: ReactNode;
  /** Hover text and screen-reader wording for the count, e.g. "More than the 5 it should hold". */
  countLabel?: string;
  countTone?: "default" | "warning";
  /** A status colour from the workspace (a dot before the name). */
  color?: string;
  /** A small menu or icon button at the end of the header. */
  actions?: ReactNode;
  /** Below the cards: "Show more", "Add task". */
  footer?: ReactNode;
  /** A card is being dragged over this column. */
  highlight?: boolean;
  ref?: Ref<HTMLElement>;
  className?: string;
  /** Usually a `KanbanList`. */
  children: ReactNode;
}) {
  return (
    <section
      ref={ref}
      aria-label={title}
      data-slot="kanban-column"
      className={cn(
        "flex w-72 shrink-0 flex-col rounded-xl border bg-muted/50",
        highlight && "ring-2 ring-ring/30",
        className,
      )}
    >
      <header className="flex min-h-11 items-center gap-2 px-3 pt-2.5 pb-1.5">
        {color && (
          <span
            className="size-2.5 shrink-0 rounded-full"
            style={{ background: color }}
            aria-hidden
          />
        )}
        <h2 className="truncate text-sm font-semibold">{title}</h2>
        {count !== undefined && (
          <span
            title={countLabel}
            className={cn(
              "rounded-full px-2 py-0.5 text-xs font-medium tabular-nums",
              countTone === "warning"
                ? "bg-warning-muted text-warning"
                : "bg-background text-muted-foreground",
            )}
          >
            {count}
            {countLabel && <span className="sr-only"> ({countLabel})</span>}
          </span>
        )}
        {actions && <div className="ms-auto flex items-center">{actions}</div>}
      </header>
      {children}
      {footer && <div className="space-y-1 px-2 pb-2">{footer}</div>}
    </section>
  );
}

function KanbanList({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="kanban-list"
      className={cn("flex min-h-16 flex-1 flex-col gap-2 px-2 pb-2", className)}
      {...props}
    />
  );
}

/** One card. `selected` when its pane is open; `lifted` while it is being dragged. */
function KanbanCard({
  selected = false,
  lifted = false,
  className,
  ...props
}: React.ComponentProps<"div"> & { selected?: boolean; lifted?: boolean }) {
  return (
    <div
      data-slot="kanban-card"
      data-selected={selected || undefined}
      className={cn(
        "rounded-xl border bg-card p-3 text-sm text-card-foreground shadow-xs transition-colors",
        selected && "border-brand/50 bg-[color-mix(in_oklch,var(--accent)_55%,var(--card))]",
        lifted && "rotate-2 shadow-lg ring-2 ring-ring/40",
        className,
      )}
      {...props}
    />
  );
}

export { KanbanBoard, KanbanColumn, KanbanList, KanbanCard };
