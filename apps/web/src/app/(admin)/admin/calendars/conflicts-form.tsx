"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Dropdown } from "@/components/dropdown";
import { saveCalendarSettings } from "../integrations-actions";

export type ConflictCalendar = { id: string; name: string; primary?: boolean };

/**
 * "Check for conflicts with" (`mocks.png` 05) for one connected account: a box per calendar and
 * where new bookings go. Saves on every change; there is nothing to forget to press.
 */
export function ConflictsForm({
  provider,
  account,
  calendars,
  conflict,
  destination,
}: {
  provider: "google" | "microsoft";
  account: string;
  calendars: ConflictCalendar[];
  conflict: string[];
  destination: string;
}) {
  const [state, action] = useActionState(
    saveCalendarSettings,
    {} as { ok?: boolean; error?: string },
  );
  const [, start] = useTransition();
  // Controlled, and saved from state: after a save the page comes back with the new values,
  // which a default can't take.
  const [on, setOn] = useState(() => new Set(conflict));
  const [dest, setDest] = useState(destination);
  const save = (next: Set<string>, to: string) => {
    const f = new FormData();
    f.set("provider", provider);
    f.set("destinationCalendarId", to);
    for (const id of next) f.append("conflict", id);
    start(() => action(f));
  };
  useEffect(() => {
    if (state.ok) toast.success("Saved");
    else if (state.error) toast.error(state.error);
  }, [state]);
  return (
    <div className="space-y-3 text-sm">
      <ul className="space-y-2" aria-label={`Calendars in ${account}`}>
        {calendars.map((c) => (
          <li key={c.id}>
            <label className="inline-flex items-center gap-2.5">
              <Checkbox
                checked={on.has(c.id)}
                onCheckedChange={(checked) => {
                  const next = new Set(on);
                  if (checked) next.add(c.id);
                  else next.delete(c.id);
                  setOn(next);
                  save(next, dest);
                }}
              />
              <span>
                {c.name}
                {c.primary && <span className="text-muted-foreground"> (primary, {account})</span>}
              </span>
            </label>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <label htmlFor={`dest-${provider}`} className="text-muted-foreground">
          Add new bookings to
        </label>
        <Dropdown
          id={`dest-${provider}`}
          size="sm"
          value={dest}
          onValueChange={(v) => {
            setDest(v);
            save(on, v);
          }}
          className="w-56"
          options={calendars.map((c) => ({ value: c.id, label: c.name }))}
        />
      </div>
    </div>
  );
}
