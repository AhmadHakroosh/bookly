"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { SubmitButton } from "@/components/submit-button";
import { saveNotificationKindsAction, type KindsState } from "./feed-actions";

export type KindRow = {
  key: string;
  label: string;
  hint: string;
  inApp: boolean;
  desktop: boolean;
  email: boolean;
};

const COLUMNS = [
  ["inApp", "In Bookly"],
  ["desktop", "Desktop"],
  ["email", "Email"],
] as const;

/** One row per kind of notification, one checkbox per channel. */
export function KindsForm({ rows }: { rows: KindRow[] }) {
  const [state, action] = useActionState(saveNotificationKindsAction, {} as KindsState);
  useEffect(() => {
    if (state.ok) toast.success("Saved");
    else if (state.error) toast.error(state.error);
  }, [state]);
  return (
    <form action={action} className="space-y-4">
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th scope="col" className="px-3 py-2 font-medium">
                Tell me when
              </th>
              {COLUMNS.map(([, label]) => (
                <th key={label} scope="col" className="w-24 px-2 py-2 text-center font-medium">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-b last:border-b-0">
                <th scope="row" className="px-3 py-2.5 text-left font-normal">
                  <span className="block font-medium">{r.label}</span>
                  <span className="text-xs text-muted-foreground">{r.hint}</span>
                </th>
                {COLUMNS.map(([col, label]) => (
                  <td key={col} className="px-2 py-2.5 text-center">
                    <input
                      type="checkbox"
                      name={`${r.key}:${col}`}
                      defaultChecked={r[col]}
                      aria-label={`${r.label}: ${label}`}
                      className="size-4"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Booking emails carry the calendar invite; turn them off only if your calendar is connected.
        Texts and Slack follow the switches further down.
      </p>
      <SubmitButton pendingText="Saving…" className="w-full">
        Save
      </SubmitButton>
    </form>
  );
}
