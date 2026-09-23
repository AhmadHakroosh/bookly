"use client";

import { useState } from "react";
import { CheckIcon, XIcon } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** A dozen presets that read on light and dark surfaces, then anything by hex. */
export const COLOR_PRESETS = [
  "#2563eb",
  "#0891b2",
  "#059669",
  "#65a30d",
  "#ca8a04",
  "#e8965a",
  "#ea580c",
  "#dc2626",
  "#db2777",
  "#9333ea",
  "#4f46e5",
  "#171717",
] as const;

/** "#abc" or "#aabbcc" in any case → "#aabbcc"; anything else → null. */
export function normalizeHex(input: string): string | null {
  const v = input.trim().replace(/^#?/, "#").toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(v)) return v;
  if (/^#[0-9a-f]{3}$/.test(v)) return `#${[...v.slice(1)].map((c) => c + c).join("")}`;
  return null;
}

/**
 * A colour field with the app's own popover instead of the browser's dialog: preset swatches,
 * a hex input, and a hidden `name` input for forms. Optional fields can be cleared.
 */
export function ColorPicker({
  name,
  id,
  defaultValue,
  value,
  onChange,
  required,
  ariaLabel = "Colour",
  placeholder = "Default",
  className,
}: {
  name?: string;
  id?: string;
  defaultValue?: string | null;
  value?: string | null;
  onChange?: (value: string) => void;
  /** With a required colour there is no clear control and the hex input must stay valid. */
  required?: boolean;
  ariaLabel?: string;
  placeholder?: string;
  className?: string;
}) {
  const [inner, setInner] = useState(defaultValue ?? "");
  const current = value ?? inner;
  const [draft, setDraft] = useState(current);
  const [open, setOpen] = useState(false);
  const set = (v: string) => {
    setInner(v);
    setDraft(v);
    onChange?.(v);
  };
  const draftOk = draft === "" ? !required : normalizeHex(draft) !== null;
  const apply = () => {
    set(draft === "" ? "" : normalizeHex(draft)!);
    setOpen(false);
  };
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <input type="hidden" name={name} value={current} />
      <Popover
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (o) setDraft(current);
        }}
      >
        <PopoverTrigger
          render={
            <Button
              id={id}
              type="button"
              variant="outline"
              aria-label={ariaLabel}
              className="h-8 gap-2 bg-background px-2 font-normal"
            />
          }
        >
          <span
            aria-hidden
            className={cn(
              "size-4 rounded-full border border-foreground/15",
              !current &&
                "bg-[linear-gradient(135deg,transparent_45%,var(--color-muted-foreground)_45%,var(--color-muted-foreground)_55%,transparent_55%)]",
            )}
            style={current ? { backgroundColor: current } : undefined}
          />
          <span className={cn("font-mono text-xs", !current && "text-muted-foreground")}>
            {current || placeholder}
          </span>
        </PopoverTrigger>
        <PopoverContent className="w-64" align="start">
          <div className="grid grid-cols-6 gap-1.5" role="listbox" aria-label="Preset colours">
            {COLOR_PRESETS.map((c) => (
              <button
                key={c}
                type="button"
                role="option"
                aria-selected={current === c}
                aria-label={c}
                onClick={() => {
                  set(c);
                  setOpen(false);
                }}
                className="flex size-8 items-center justify-center rounded-md border border-foreground/10 transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
                style={{ backgroundColor: c }}
              >
                {current === c && <CheckIcon className="size-4 text-white drop-shadow" />}
              </button>
            ))}
          </div>
          {/* Not a nested form: the picker sits inside the page's form, so Enter is handled here. */}
          <div className="flex items-center gap-2">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                if (draftOk) apply();
              }}
              placeholder="#2563eb"
              aria-label="Hex colour"
              aria-invalid={!draftOk}
              className="h-8 font-mono text-xs"
              spellCheck={false}
            />
            <Button type="button" size="sm" variant="outline" disabled={!draftOk} onClick={apply}>
              Use
            </Button>
          </div>
          {!required && current && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="justify-start text-muted-foreground"
              onClick={() => {
                set("");
                setOpen(false);
              }}
            >
              <XIcon /> Clear
            </Button>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
