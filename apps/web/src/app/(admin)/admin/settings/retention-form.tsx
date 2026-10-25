"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Dropdown } from "@/components/dropdown";
import { updateWorkspaceSettings, type SettingsState } from "./actions";

/** "Keep transcripts for": saves as it is picked. */
export function RetentionForm({ days }: { days: number }) {
  const [state, action] = useActionState(updateWorkspaceSettings, {} as SettingsState);
  const [, start] = useTransition();
  // Controlled: after a save the page comes back with the new value, which a default can't take.
  const [value, setValue] = useState(String(days));
  useEffect(() => {
    if (state.ok) toast.success("Retention saved");
    else if (state.error) toast.error(state.error);
  }, [state]);
  return (
    <Dropdown
      id="retention"
      ariaLabel="Transcript retention"
      value={value}
      className="w-full sm:w-56"
      onValueChange={(v) => {
        setValue(v);
        const f = new FormData();
        f.set("section", "privacy");
        f.set("retentionDays", v);
        start(() => action(f));
      }}
      options={[
        { value: "30", label: "Keep for 30 days" },
        { value: "90", label: "Keep for 90 days" },
        { value: "180", label: "Keep for 6 months" },
        { value: "365", label: "Keep for 1 year" },
      ]}
    />
  );
}
