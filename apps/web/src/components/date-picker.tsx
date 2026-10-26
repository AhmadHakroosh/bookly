"use client";

import { useState } from "react";
import { format, parseISO } from "date-fns";
import { CalendarIcon, XIcon } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const iso = (d: Date) => format(d, "yyyy-MM-dd");

/**
 * A date field with the app's calendar instead of the browser's: a button showing the date, a
 * popover to pick one, and a hidden `name` input carrying `yyyy-mm-dd` for forms.
 */
export function DatePicker({
  name,
  id,
  defaultValue,
  value,
  onChange,
  required,
  placeholder = "Pick a date",
  ariaLabel,
  className,
  fromDate,
  size = "default",
}: {
  name?: string;
  id?: string;
  defaultValue?: string | null;
  value?: string | null;
  onChange?: (value: string) => void;
  required?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
  /** Earliest selectable day. */
  fromDate?: Date;
  /** 40 px beside default buttons, 32 px in toolbars and rows. */
  size?: "default" | "sm";
}) {
  const [inner, setInner] = useState(defaultValue ?? "");
  const current = value ?? inner;
  const date = current ? parseISO(current) : undefined;
  const [open, setOpen] = useState(false);
  const set = (v: string) => {
    setInner(v);
    onChange?.(v);
  };
  return (
    <div className={cn("relative", className)}>
      <input type="hidden" name={name} value={current} />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              id={id}
              type="button"
              variant="outline"
              // A button cannot carry aria-required (axe: aria-allowed-attr); say it in words.
              aria-label={ariaLabel && required ? `${ariaLabel} (required)` : ariaLabel}
              className={cn(
                "w-full justify-start gap-2 bg-field px-3 font-normal",
                size === "sm" ? "h-8 px-2.5" : "h-10",
                !date && "text-muted-foreground",
                !required && date && "pr-8",
              )}
            />
          }
        >
          <CalendarIcon className="text-muted-foreground" />
          {date ? format(date, "PP") : placeholder}
          {required && !ariaLabel && <span className="sr-only"> (required)</span>}
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={date}
            defaultMonth={date}
            disabled={fromDate ? { before: fromDate } : undefined}
            onSelect={(d) => {
              if (d) set(iso(d));
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
      {!required && date && (
        <button
          type="button"
          aria-label="Clear date"
          onClick={() => set("")}
          className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md p-0.5 text-muted-foreground hover:text-foreground"
        >
          <XIcon className="size-3.5" />
        </button>
      )}
    </div>
  );
}
