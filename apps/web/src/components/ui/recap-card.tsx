import type { ReactNode } from "react";
import { FileTextIcon } from "lucide-react";
import { cn } from "cn";

/**
 * "Recap ready" on Home (`app ui.png`): a Peach card with the label, the call it is about, what
 * it holds ("3 decisions • 2 action items") and the action. Its button is the default Button,
 * Bookly Orange, as the concept fills it.
 */
function RecapCard({
  label = "Recap ready",
  title,
  meta,
  action,
  className,
}: {
  label?: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  /** A `Button`: "Review recap →". */
  action?: ReactNode;
  className?: string;
}) {
  return (
    <section
      data-slot="recap-card"
      className={cn(
        "flex flex-wrap items-center justify-between gap-4 rounded-xl border border-primary/20 bg-accent p-5",
        className,
      )}
    >
      <div className="min-w-0 space-y-1">
        <p className="flex items-center gap-2 text-sm font-medium text-accent-foreground">
          <FileTextIcon className="size-4" aria-hidden />
          {label}
        </p>
        <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
        {meta && <p className="text-sm text-muted-foreground">{meta}</p>}
      </div>
      {action}
    </section>
  );
}

export { RecapCard };
