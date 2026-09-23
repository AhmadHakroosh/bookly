"use client";

import type { ReactNode } from "react";
import { cn } from "cn";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type DropdownOption = { value: string; label: ReactNode; disabled?: boolean };

/**
 * The app's dropdown: the shadcn Select over Base UI, with the native select's ergonomics.
 * Works uncontrolled in a plain form (`name` + `defaultValue`, a hidden input is submitted) or
 * controlled (`value` + `onValueChange`).
 */
export function Dropdown({
  options,
  name,
  id,
  value,
  defaultValue,
  onValueChange,
  placeholder = "Choose…",
  ariaLabel,
  required,
  disabled,
  className,
  contentClassName,
  size = "default",
  renderValue,
}: {
  options: DropdownOption[];
  name?: string;
  id?: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  required?: boolean;
  disabled?: boolean;
  /** The trigger; give it a width, it defaults to fitting its content. */
  className?: string;
  contentClassName?: string;
  size?: "sm" | "default";
  /** What the closed trigger shows for a value, when it should differ from the list label. */
  renderValue?: (value: string) => ReactNode;
}) {
  const items = options.map((o) => ({ value: o.value, label: o.label }));
  return (
    <Select
      items={items}
      name={name}
      value={value}
      defaultValue={defaultValue}
      onValueChange={(v) => onValueChange?.(String(v ?? ""))}
      required={required}
      disabled={disabled}
    >
      <SelectTrigger
        id={id}
        aria-label={ariaLabel}
        size={size}
        className={cn("w-full min-w-0 bg-background", className)}
      >
        <SelectValue placeholder={placeholder}>
          {renderValue ? (v: string | null) => (v ? renderValue(v) : placeholder) : undefined}
        </SelectValue>
      </SelectTrigger>
      {/* Drop below the field like a menu, instead of overlaying the selected item on it. */}
      <SelectContent alignItemWithTrigger={false} align="start" className={contentClassName}>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
