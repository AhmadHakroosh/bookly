"use client";

import { useState } from "react";
import { DatePicker } from "@/components/date-picker";
import { SubmitButton } from "@/components/submit-button";
import { TimePicker } from "@/components/time-picker";
import { addOverride } from "../scheduling-actions";

/**
 * Add a date override: date, from and to on one line, the switches on the next, and the button
 * below (full width on small screens). "Unavailable all day" disables the hours.
 */
export function OverrideForm({ scheduleId, multi }: { scheduleId: string; multi: boolean }) {
  const [blocked, setBlocked] = useState(false);
  return (
    <form action={addOverride} className="space-y-3 rounded-xl border p-4 text-sm">
      <input type="hidden" name="scheduleId" value={scheduleId} />
      <div className="grid grid-cols-3 gap-2">
        <label className="block min-w-0">
          <span className="mb-1 block text-xs font-medium">Date</span>
          <DatePicker name="date" required ariaLabel="Date" />
        </label>
        <label className="block min-w-0">
          <span className="mb-1 block text-xs font-medium">From</span>
          <TimePicker name="start" ariaLabel="From" disabled={blocked} />
        </label>
        <label className="block min-w-0">
          <span className="mb-1 block text-xs font-medium">To</span>
          <TimePicker name="end" ariaLabel="To" disabled={blocked} />
        </label>
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        <label className="inline-flex items-center gap-1.5">
          <input
            type="checkbox"
            name="blocked"
            checked={blocked}
            onChange={(e) => setBlocked(e.target.checked)}
          />
          Unavailable all day
        </label>
        {multi && (
          <label className="inline-flex items-center gap-1.5">
            <input type="checkbox" name="all" defaultChecked /> Apply to all my schedules
          </label>
        )}
      </div>
      <SubmitButton className="w-full sm:w-auto">Add override</SubmitButton>
    </form>
  );
}
