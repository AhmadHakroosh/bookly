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
              aria-label={ariaLabel}
              aria-required={required || undefined}
              className={cn(
                "h-8 w-full justify-start gap-2 bg-background px-2.5 font-normal",
                !date && "text-muted-foreground",
                !required && date && "pr-8",
              )}
            />
          }
        >
          <CalendarIcon className="text-muted-foreground" />
          {date ? format(date, "PP") : placeholder}
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
