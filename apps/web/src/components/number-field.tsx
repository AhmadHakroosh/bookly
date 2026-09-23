"use client";

import { NumberField as NumberFieldPrimitive } from "@base-ui/react/number-field";
import { MinusIcon, PlusIcon } from "lucide-react";
import { cn } from "cn";

/**
 * The app's number input: Base UI's NumberField with the spinner as real buttons on either side
 * and an optional unit addon. Submits a plain number under `name` (a hidden input), so server
 * actions read it exactly as before. Values are never grouped ("1440", not "1,440").
 */
export function NumberField({
  name,
  id,
  defaultValue,
  value,
  onValueChange,
  min,
  max,
  step = 1,
  decimals,
  unit,
  required,
  disabled,
  placeholder,
  ariaLabel,
  className,
  inputClassName,
}: {
  name?: string;
  id?: string;
  defaultValue?: number | string | null;
  value?: number | null;
  onValueChange?: (value: number | null) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Fraction digits shown and accepted (defaults to what `step` needs). */
  decimals?: number;
  /** Text joined to the right edge, e.g. "min" or "%". */
  unit?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
  inputClassName?: string;
}) {
  const fraction = decimals ?? String(step).split(".")[1]?.length ?? 0;
  const initial =
    defaultValue === "" || defaultValue === null || defaultValue === undefined
      ? undefined
      : Number(defaultValue);
  const btn =
    "flex h-8 w-8 shrink-0 items-center justify-center border border-input bg-muted text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-3.5";
  return (
    <NumberFieldPrimitive.Root
      id={id}
      name={name}
      defaultValue={Number.isFinite(initial) ? initial : undefined}
      value={value}
      onValueChange={(v) => onValueChange?.(v)}
      min={min}
      max={max}
      // Decimals with a whole-number step: the buttons still step by `step` (Base UI treats
      // "any" as 1) while the hidden input, which takes part in form validation, accepts any
      // fraction instead of flagging a step mismatch and silently blocking the submit.
      step={fraction > 0 && Number.isInteger(step) ? "any" : step}
      required={required}
      disabled={disabled}
      allowWheelScrub={false}
      format={{
        useGrouping: false,
        minimumFractionDigits: fraction,
        maximumFractionDigits: fraction,
      }}
      className={cn("min-w-0", className)}
    >
      <NumberFieldPrimitive.Group className="flex">
        <NumberFieldPrimitive.Decrement
          aria-label="Decrease"
          className={cn(btn, "rounded-l-lg border-r-0")}
        >
          <MinusIcon />
        </NumberFieldPrimitive.Decrement>
        <NumberFieldPrimitive.Input
          aria-label={ariaLabel}
          placeholder={placeholder}
          className={cn(
            "h-8 w-full min-w-0 border border-input bg-background px-2 text-center text-sm tabular-nums outline-none focus-visible:z-10 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 dark:bg-input/30",
            !unit && "rounded-r-none",
            inputClassName,
          )}
        />
        <NumberFieldPrimitive.Increment
          aria-label="Increase"
          className={cn(btn, "border-l-0", unit ? "" : "rounded-r-lg")}
        >
          <PlusIcon />
        </NumberFieldPrimitive.Increment>
        {unit && (
          <span
            aria-hidden
            className="flex shrink-0 items-center rounded-r-lg border border-l-0 border-input bg-muted px-3 text-xs whitespace-nowrap text-muted-foreground"
          >
            {unit}
          </span>
        )}
      </NumberFieldPrimitive.Group>
    </NumberFieldPrimitive.Root>
  );
}
