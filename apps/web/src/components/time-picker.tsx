"use client";

import { Dropdown } from "@/components/dropdown";

/** "HH:MM" every `stepMin` minutes across the day, plus the current value when off the grid. */
export function timeOptions(stepMin = 15, current?: string) {
  const out: string[] = [];
  for (let m = 0; m < 24 * 60; m += stepMin)
    out.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
  if (current && /^\d{2}:\d{2}$/.test(current) && !out.includes(current))
    out.splice(
      out.findIndex((t) => t > current) === -1 ? out.length : out.findIndex((t) => t > current),
      0,
      current,
    );
  return out;
}

/**
 * A time field using the app's dropdown instead of the browser's clock control: 24-hour
 * "HH:MM" values in quarter-hour steps, the same format schedules store and display.
 */
export function TimePicker({
  name,
  id,
  value,
  defaultValue,
  onValueChange,
  ariaLabel,
  required,
  placeholder = "--:--",
  stepMin = 15,
  className,
}: {
  name?: string;
  id?: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  ariaLabel?: string;
  required?: boolean;
  placeholder?: string;
  stepMin?: number;
  className?: string;
}) {
  const options = timeOptions(stepMin, value ?? defaultValue).map((t) => ({ value: t, label: t }));
  return (
    <Dropdown
      name={name}
      id={id}
      value={value}
      defaultValue={defaultValue}
      onValueChange={onValueChange}
      ariaLabel={ariaLabel}
      required={required}
      placeholder={placeholder}
      className={className}
      contentClassName="max-h-72"
      options={required ? options : [{ value: "", label: placeholder }, ...options]}
    />
  );
}
