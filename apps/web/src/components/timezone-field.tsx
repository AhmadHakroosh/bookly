"use client";

import { useId, useState } from "react";
import { Input } from "@/components/ui/input";

/**
 * Timezone picker: a text input backed by a `<datalist>` so users can type to
 * filter the IANA list, plus a one-click "use my timezone" shortcut.
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
  const listId = useId();
  const [value, setValue] = useState(defaultValue);
  const detect = () => {
    try {
      setValue(Intl.DateTimeFormat().resolvedOptions().timeZone);
    } catch {
      /* keep the current value */
    }
  };
  return (
    <div className={className}>
      <div className="flex items-center gap-2">
        <Input
          id={name}
          name={name}
          list={listId}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Type to search, e.g. Europe/Berlin"
          autoComplete="off"
          spellCheck={false}
          required
        />
        <button
          type="button"
          onClick={detect}
          className="shrink-0 text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          Use mine
        </button>
      </div>
      <datalist id={listId}>
        {zones.map((z) => (
          <option key={z} value={z} />
        ))}
      </datalist>
    </div>
  );
}
