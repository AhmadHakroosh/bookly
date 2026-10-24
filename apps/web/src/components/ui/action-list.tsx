import Link from "next/link";
import type { ComponentType, ReactNode, SVGProps } from "react";
import { cn } from "cn";

/**
 * "Next actions" on a contact (`ui mocks.png` 03): the steps the person's journey calls for,
 * one per row. The suggested one is Peach with Ember text ("Create proposal"), the rest are
 * plain rows ("Send payment request", "Add follow-up").
 */
function ActionList({ className, ...props }: React.ComponentProps<"ul">) {
  return <ul data-slot="action-list" className={cn("space-y-2", className)} {...props} />;
}

function ActionItem({
  icon: Icon,
  href,
  onClick,
  suggested = false,
  children,
}: {
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
  href?: string;
  onClick?: () => void;
  /** The step the journey points at next. */
  suggested?: boolean;
  children: ReactNode;
}) {
  const cls = cn(
    "flex h-10 w-full items-center gap-2.5 rounded-lg border px-3 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
    suggested
      ? "border-primary/30 bg-accent text-accent-foreground hover:bg-[color-mix(in_oklch,var(--accent),var(--primary)_8%)]"
      : "bg-card text-foreground hover:bg-muted",
  );
  const body = (
    <>
      {Icon && <Icon className="size-4 shrink-0" aria-hidden />}
      <span className="truncate">{children}</span>
    </>
  );
  return (
    <li>
      {href ? (
        <Link href={href} className={cls}>
          {body}
        </Link>
      ) : (
        <button type="button" onClick={onClick} className={cls}>
          {body}
        </button>
      )}
    </li>
  );
}

export { ActionList, ActionItem };
