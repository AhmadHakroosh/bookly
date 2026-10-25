import type { ComponentType, ReactNode, SVGProps } from "react";
import { cn } from "cn";

const DOT = {
  success: "bg-success",
  warning: "bg-warning",
  destructive: "bg-destructive",
  neutral: "bg-muted-foreground/50",
} as const;

/**
 * One connected tool (`mocks.png` 05 and 08): an icon tile, the tool's name with the account or
 * a line on what it does, its state as a dot and a word ("Connected", "Ready to use", "Not
 * connected"), and the action on the right (Connect, Manage, or ⋮). A product's own icon
 * (`ProviderIcon`, 32 px) goes in `mark`; anything that isn't a product gets a neutral `icon`.
 */
function IntegrationRow({
  icon: Icon,
  mark,
  name,
  detail,
  status,
  action,
  className,
  children,
}: {
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
  /** In place of the icon: Bookly's own mark for Bookly video. */
  mark?: ReactNode;
  name: ReactNode;
  detail?: ReactNode;
  status?: { label: string; tone: keyof typeof DOT };
  action?: ReactNode;
  className?: string;
  /** Below the row, full width: an error, or a setting that belongs to this tool. */
  children?: ReactNode;
}) {
  return (
    <li data-slot="integration-row" className={cn("px-4 py-3 sm:px-5", className)}>
      <div className="flex items-center gap-3">
        {/* A product's own icon stands alone in the 40 px slot; a neutral icon gets a tile. */}
        <span
          className={cn(
            "flex size-10 shrink-0 items-center justify-center",
            !mark && "rounded-lg border bg-background",
          )}
        >
          {mark ?? (Icon && <Icon className="size-5 text-muted-foreground" aria-hidden />)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{name}</p>
          {detail && <p className="truncate text-sm text-muted-foreground">{detail}</p>}
        </div>
        {status && (
          <span className="hidden shrink-0 items-center gap-1.5 text-xs text-muted-foreground sm:inline-flex">
            <span className={cn("size-1.5 rounded-full", DOT[status.tone])} aria-hidden />
            {status.label}
          </span>
        )}
        {action && <div className="flex shrink-0 items-center gap-1">{action}</div>}
      </div>
      {status && (
        <p className="ms-13 mt-1 inline-flex items-center gap-1.5 text-xs text-muted-foreground sm:hidden">
          <span className={cn("size-1.5 rounded-full", DOT[status.tone])} aria-hidden />
          {status.label}
        </p>
      )}
      {children && <div className="mt-3 sm:ms-13">{children}</div>}
    </li>
  );
}

/** Integration rows under one heading, in one bordered list. */
function IntegrationList({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="integration-list"
      className={cn("divide-y rounded-xl border bg-card", className)}
      {...props}
    />
  );
}

export { IntegrationRow, IntegrationList };
