"use client";

import { useId, useState, type ReactNode } from "react";
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
  toolparamdescription,
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
  /**
   * WebMCP: describes this parameter to an AI agent. With it set, the form gets a native
   * `<select>` (visually hidden, server-rendered, kept in step) that carries the name, the
   * options and the description, and Base UI's own input is detached from the form. Chrome
   * reads a declarative tool when the form first renders, so an attribute added after
   * hydration comes too late, and a native select also gives the agent the options as an enum.
   */
  toolparamdescription?: string;
}) {
  const items = options.map((o) => ({ value: o.value, label: o.label }));
  const described = toolparamdescription !== undefined;
  const [inner, setInner] = useState(defaultValue ?? "");
  const current = value ?? inner;
  const autoId = useId();
  const triggerId = id ?? `dropdown-${autoId}`;
  const change = (v: string) => {
    setInner(v);
    onValueChange?.(v);
  };
  return (
    <>
      <Select
        items={items}
        name={described ? undefined : name}
        value={described ? current : value}
        defaultValue={described ? undefined : defaultValue}
        onValueChange={(v) => change(String(v ?? ""))}
        required={described ? false : required}
        disabled={disabled}
        // Points at no form, so Base UI's unnamed input is not one of the form's controls.
        form={described ? "dropdown-detached" : undefined}
      >
        <SelectTrigger
          id={triggerId}
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
      {described && (
        <select
          name={name}
          value={current}
          required={required}
          disabled={disabled}
          onChange={(e) => change(e.target.value)}
          // Invalid-form focus lands here; send it to the visible trigger.
          onFocus={() => document.getElementById(triggerId)?.focus()}
          toolparamdescription={toolparamdescription}
          aria-hidden
          tabIndex={-1}
          className="sr-only"
        >
          <option value="">{placeholder}</option>
          {options.map((o) => (
            <option key={o.value} value={o.value} disabled={o.disabled}>
              {typeof o.label === "string" ? o.label : o.value}
            </option>
          ))}
        </select>
      )}
    </>
  );
}
