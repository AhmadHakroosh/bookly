import Link from "next/link";
import type { ComponentType, ReactNode, SVGProps } from "react";
import { cn } from "cn";

/**
 * A row of counts under a page header ("3 meetings today · 2 follow-ups due · 5 open tasks"):
 * one card, stats side by side on wide screens and stacked on a phone. A stat with `href`
 * jumps to the list behind it.
 */
function StatStrip({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="stat-strip"
      className={cn(
        "grid grid-cols-1 divide-y rounded-xl border bg-card text-card-foreground sm:auto-cols-fr sm:grid-flow-col sm:grid-cols-none sm:divide-x sm:divide-y-0",
        className,
      )}
      {...props}
    />
  );
}

const TONES = {
  default: "text-brand",
  warning: "text-warning",
  destructive: "text-destructive",
} as const;

function Stat({
  icon: Icon,
  value,
  label,
  href,
  tone = "default",
  className,
}: {
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
  value: ReactNode;
  /** Reads after the value: "meetings today". */
  label: ReactNode;
  href?: string;
  /** `warning` or `destructive` when the count needs action (overdue); never brand for status. */
  tone?: keyof typeof TONES;
  className?: string;
}) {
  const body = (
    <>
      {Icon && <Icon className={cn("size-5 shrink-0", TONES[tone])} aria-hidden />}
      <span className="min-w-0 truncate">
        <span
          className={cn(
            "font-semibold tabular-nums",
            tone === "default" ? "text-foreground" : TONES[tone],
          )}
        >
          {value}
        </span>{" "}
        <span className="text-muted-foreground">{label}</span>
      </span>
    </>
  );
  const cls = "flex items-center justify-center gap-3 px-4 py-3.5 text-sm sm:px-5";
  return (
    <li data-slot="stat" className={cn("min-w-0", className)}>
      {href ? (
        <Link
          href={href}
          className={cn(
            cls,
            "rounded-[inherit] outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50",
          )}
        >
          {body}
        </Link>
      ) : (
        <div className={cls}>{body}</div>
      )}
    </li>
  );
}

export { StatStrip, Stat };
