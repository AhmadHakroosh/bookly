"use client";

import { useActionState, useEffect, useRef, useTransition } from "react";
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
  const form = useRef<HTMLFormElement>(null);
  // After the change has rendered, so the form carries the new value.
  const save = () => setTimeout(() => start(() => action(new FormData(form.current!))), 0);
  useEffect(() => {
    if (state.ok) toast.success("Saved");
    else if (state.error) toast.error(state.error);
  }, [state]);
  const on = new Set(conflict);
  return (
    <form ref={form} action={action} className="space-y-3 text-sm">
      <input type="hidden" name="provider" value={provider} />
      <ul className="space-y-2" aria-label={`Calendars in ${account}`}>
        {calendars.map((c) => (
          <li key={c.id}>
            <label className="inline-flex items-center gap-2.5">
              <Checkbox
                name="conflict"
                value={c.id}
                defaultChecked={on.has(c.id)}
                onCheckedChange={save}
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
          name="destinationCalendarId"
          size="sm"
          defaultValue={destination}
          onValueChange={save}
          className="w-56"
          options={calendars.map((c) => ({ value: c.id, label: c.name }))}
        />
      </div>
    </form>
  );
}
