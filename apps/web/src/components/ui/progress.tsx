"use client";

import type { ReactNode } from "react";
import { Progress as ProgressPrimitive } from "@base-ui/react/progress";
import { cn } from "cn";

/**
 * A bar in Bookly Orange on Sand: reviews submitted, seats used, steps done. The label is
 * required (it names the bar for screen readers); `valueText` is what they hear for the number,
 * such as "2 of 3 submitted", and is shown on the right when `showValue` is set.
 */
function Progress({
  value,
  max = 100,
  label,
  valueText,
  showValue = false,
  hideLabel = false,
  tone = "brand",
  className,
}: {
  value: number | null;
  max?: number;
  label: ReactNode;
  valueText?: string;
  showValue?: boolean;
  /** Keep the label for screen readers only, when the text around the bar already says it. */
  hideLabel?: boolean;
  /** `warning` (orange) once a limit is reached; brand otherwise. */
  tone?: "brand" | "warning";
  className?: string;
}) {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      value={value}
      max={max}
      aria-valuetext={valueText}
      className={cn("grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1.5", className)}
    >
      <ProgressPrimitive.Label className={cn("text-sm font-medium", hideLabel && "sr-only")}>
        {label}
      </ProgressPrimitive.Label>
      {showValue ? (
        <span className="text-right text-sm text-muted-foreground tabular-nums">
          {valueText ?? <ProgressPrimitive.Value />}
        </span>
      ) : (
        <span />
      )}
      <ProgressPrimitive.Track className="col-span-2 h-2 overflow-hidden rounded-full bg-muted">
        <ProgressPrimitive.Indicator
          className={cn("rounded-full", tone === "warning" ? "bg-warning" : "bg-brand")}
        />
      </ProgressPrimitive.Track>
    </ProgressPrimitive.Root>
  );
}

export { Progress };
