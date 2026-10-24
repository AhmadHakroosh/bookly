import type { ComponentType, ReactNode, SVGProps } from "react";
import { cn } from "cn";

const TONES = {
  brand: "bg-accent text-brand",
  info: "bg-info-muted text-info",
  success: "bg-success-muted text-success",
  warning: "bg-warning-muted text-warning",
  neutral: "bg-muted text-muted-foreground",
} as const;

/**
 * A contact's history (`ui mocks.png` 03): entries newest first on a rail, each with a coloured
 * icon for its kind (booking, message, recap, payment), a time, what happened, detail below and
 * a "View" link on the right.
 */
function Timeline({ className, ...props }: React.ComponentProps<"ol">) {
  return <ol data-slot="timeline" className={cn("flex flex-col", className)} {...props} />;
}

function TimelineEntry({
  icon: Icon,
  tone = "neutral",
  time,
  dateTime,
  title,
  action,
  className,
  children,
}: {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  tone?: keyof typeof TONES;
  /** Already formatted in the viewer's timezone. */
  time: ReactNode;
  dateTime?: string;
  title: ReactNode;
  /** A "View" link or a chip ("Paid") on the right. */
  action?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <li
      data-slot="timeline-entry"
      className={cn(
        "relative grid grid-cols-[2rem_minmax(0,1fr)] gap-x-3 pb-5 last:pb-0",
        "before:absolute before:start-4 before:top-9 before:bottom-1 before:w-px before:bg-border last:before:hidden",
        className,
      )}
    >
      <span
        className={cn("flex size-8 items-center justify-center rounded-full", TONES[tone])}
        aria-hidden
      >
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 space-y-0.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <time dateTime={dateTime} className="block text-xs text-muted-foreground">
              {time}
            </time>
            <p className="text-sm font-medium">{title}</p>
          </div>
          {action && <div className="shrink-0 text-sm">{action}</div>}
        </div>
        {children && <div className="text-sm text-muted-foreground">{children}</div>}
      </div>
    </li>
  );
}

export { Timeline, TimelineEntry };
