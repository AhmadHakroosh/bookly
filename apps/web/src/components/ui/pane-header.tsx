import type { ReactNode } from "react";
import { cn } from "cn";

/**
 * The top of a side pane (`PaneHost`): a picture or icon, the title, one line of context and
 * the status (a chip or a stage selector), with the pane's actions on the right. It leaves room
 * at the end for the sheet's own close button.
 */
function PaneHeader({
  media,
  title,
  subtitle,
  status,
  actions,
  as: Heading = "h2",
  className,
}: {
  /** An `Avatar` (size lg) or a file icon. */
  media?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  status?: ReactNode;
  actions?: ReactNode;
  /** `h1` when the pane is the only content of its dialog and nothing above names it. */
  as?: "h1" | "h2";
  className?: string;
}) {
  return (
    <div data-slot="pane-header" className={cn("flex items-start gap-4 pe-8", className)}>
      {media && <div className="shrink-0">{media}</div>}
      <div className="min-w-0 flex-1 space-y-1">
        <Heading className="text-lg font-semibold tracking-tight break-words">{title}</Heading>
        {subtitle && <div className="text-sm text-muted-foreground">{subtitle}</div>}
        {status && <div className="pt-1">{status}</div>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
    </div>
  );
}

export { PaneHeader };
