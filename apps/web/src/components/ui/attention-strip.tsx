import Link from "next/link";
import type { ComponentType, ReactNode, SVGProps } from "react";
import { AlertCircleIcon, ArrowRightIcon } from "lucide-react";
import { cn } from "cn";

/**
 * "Needs attention" under a board (`hiring.png`): a warning heading, then one card per thing
 * waiting on the team, each with what it is, why, and the link that deals with it.
 */
function AttentionStrip({
  title = "Needs attention",
  className,
  children,
}: {
  title?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section data-slot="attention-strip" className={cn("rounded-xl border bg-card p-4", className)}>
      <h2 className="mb-3 flex items-center gap-2 text-base font-semibold">
        <AlertCircleIcon className="size-5 text-warning" aria-hidden />
        {title}
      </h2>
      <ul className="grid gap-3 md:grid-cols-2">{children}</ul>
    </section>
  );
}

function AttentionItem({
  icon: Icon,
  title,
  detail,
  action,
}: {
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
  title: ReactNode;
  detail?: ReactNode;
  action?: { label: string; href: string };
}) {
  return (
    <li className="flex items-center gap-3 rounded-lg border px-3 py-3">
      {Icon && <Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden />}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{title}</p>
        {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
      </div>
      {action && (
        <Link
          href={action.href}
          className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          {action.label}
          <ArrowRightIcon className="size-4" aria-hidden />
        </Link>
      )}
    </li>
  );
}

export { AttentionStrip, AttentionItem };
