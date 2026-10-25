"use client";

import { useActionState, useEffect, useRef, useTransition } from "react";
import { toast } from "sonner";
import { Dropdown } from "@/components/dropdown";
import { updateWorkspaceSettings, type SettingsState } from "./actions";

/** "Keep transcripts for": saves as it is picked. */
export function RetentionForm({ days }: { days: number }) {
  const [state, action] = useActionState(updateWorkspaceSettings, {} as SettingsState);
  const [, start] = useTransition();
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) toast.success("Retention saved");
    else if (state.error) toast.error(state.error);
  }, [state]);
  return (
    <form ref={form} action={action}>
      <input type="hidden" name="section" value="privacy" />
      <Dropdown
        id="retention"
        name="retentionDays"
        defaultValue={String(days)}
        className="w-full sm:w-56"
        onValueChange={() => setTimeout(() => start(() => action(new FormData(form.current!))), 0)}
        options={[
          { value: "30", label: "Keep for 30 days" },
          { value: "90", label: "Keep for 90 days" },
          { value: "180", label: "Keep for 6 months" },
          { value: "365", label: "Keep for 1 year" },
        ]}
      />
    </form>
  );
}
