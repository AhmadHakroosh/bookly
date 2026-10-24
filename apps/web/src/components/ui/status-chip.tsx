import type { ReactNode } from "react";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";

/**
 * A status beside a title or in a row: "Open", "Confirmed", "Intake ready", "Feedback missing".
 * Status is semantic (DESIGN.md): `success`, `warning`, `destructive`, `info`, or `neutral`
 * for states that need nothing. `accent` (Peach and Ember) is emphasis that is not a status,
 * such as "In 15 min". The dot is decoration; the words carry the meaning.
 */
const VARIANT = {
  neutral: "secondary",
  accent: "accent",
  success: "success",
  warning: "warning",
  destructive: "destructive",
  info: "info",
} as const;

export type StatusTone = keyof typeof VARIANT;

function StatusChip({
  tone = "neutral",
  dot = false,
  icon,
  className,
  children,
}: {
  tone?: StatusTone;
  dot?: boolean;
  /** A 12 px lucide icon before the label, instead of the dot. */
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Badge
      variant={VARIANT[tone]}
      data-slot="status-chip"
      data-tone={tone}
      className={cn(
        "h-6 rounded-full px-2.5 text-xs font-medium",
        (dot || icon) && "pl-2",
        className,
      )}
    >
      {icon}
      {dot && !icon && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </Badge>
  );
}

export { StatusChip };
