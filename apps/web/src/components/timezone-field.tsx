"use client";

import { useState } from "react";
import { Dropdown } from "@/components/dropdown";
import { canonicalTimezone } from "@/lib/time";

/**
 * Timezone picker: the app's dropdown over the full IANA list, plus a one-click "Use mine"
 * that picks the browser's zone. A stored value the runtime spells differently is kept in the
 * list so it never shows blank.
 */
export function TimezoneField({
  name,
  defaultValue,
  zones,
  className,
}: {
  name: string;
  defaultValue: string;
  zones: string[];
  className?: string;
}) {
  const [value, setValue] = useState(defaultValue);
  const list = zones.includes(value) ? zones : [value, ...zones];
  const detect = () => {
    try {
      const mine = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const tz = canonicalTimezone(mine) ?? mine;
      if (tz) setValue(zones.includes(tz) ? tz : mine);
    } catch {
      /* keep the current value */
    }
  };
  return (
    <div className={`flex items-center gap-2 ${className ?? ""}`}>
      <Dropdown
        id={name}
        name={name}
        value={value}
        onValueChange={setValue}
        ariaLabel="Timezone"
        required
        className="min-w-0 flex-1"
        contentClassName="max-h-80"
        options={list.map((z) => ({ value: z, label: z.replace(/_/g, " ") }))}
      />
      <button
        type="button"
        onClick={detect}
        className="shrink-0 text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
      >
        Use mine
      </button>
    </div>
  );
}
