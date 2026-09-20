"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveSchedule } from "../scheduling-actions";

type Day = { weekday: number; label: string; ranges: { start: string; end: string }[] };

export function ScheduleForm({
  scheduleId,
  name,
  timezone,
  zones,
  days,
}: {
  scheduleId: string;
  name: string;
  timezone: string;
  zones: string[];
  days: Day[];
}) {
  const [state, action, pending] = useActionState(
    saveSchedule,
    {} as { ok?: boolean; error?: string },
  );
  const [rows, setRows] = useState<Day[]>(days);
  useEffect(() => {
    if (state.ok) toast.success("Availability saved");
    else if (state.error) toast.error(state.error);
  }, [state]);
  const update = (wd: number, fn: (d: Day) => Day) =>
    setRows((r) => r.map((d) => (d.weekday === wd ? fn(d) : d)));
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="scheduleId" value={scheduleId} />
      <div className="flex flex-wrap gap-3">
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium">Schedule name</span>
          <Input name="name" defaultValue={name} className="w-48" />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium">Timezone</span>
          <select
            name="timezone"
            defaultValue={timezone}
            className="h-8 rounded-lg border bg-background px-2 text-sm"
          >
            {zones.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
        </label>
      </div>
      <ul className="divide-y rounded-xl border">
        {rows.map((d) => (
          <li key={d.weekday} className="flex flex-wrap items-start gap-3 p-3 text-sm">
            <label className="inline-flex w-32 items-center gap-2 pt-1.5">
              <input
                type="checkbox"
                name={`on_${d.weekday}`}
                checked={d.ranges.length > 0}
                onChange={(e) =>
                  update(d.weekday, (x) => ({
                    ...x,
                    ranges: e.target.checked ? [{ start: "09:00", end: "17:00" }] : [],
                  }))
                }
              />
              {d.label}
            </label>
            <div className="flex-1 space-y-1">
              {d.ranges.map((r, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="time"
                    name={`start_${d.weekday}`}
                    value={r.start}
                    onChange={(e) =>
                      update(d.weekday, (x) => ({
                        ...x,
                        ranges: x.ranges.map((y, j) =>
                          j === i ? { ...y, start: e.target.value } : y,
                        ),
                      }))
                    }
                    className="h-8 rounded-md border bg-background px-2"
                  />
                  <span>–</span>
                  <input
                    type="time"
                    name={`end_${d.weekday}`}
                    value={r.end}
                    onChange={(e) =>
                      update(d.weekday, (x) => ({
                        ...x,
                        ranges: x.ranges.map((y, j) =>
                          j === i ? { ...y, end: e.target.value } : y,
                        ),
                      }))
                    }
                    className="h-8 rounded-md border bg-background px-2"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      update(d.weekday, (x) => ({
                        ...x,
                        ranges: x.ranges.filter((_, j) => j !== i),
                      }))
                    }
                    className="text-xs text-muted-foreground"
                    aria-label="Remove range"
                  >
                    ✕
                  </button>
                </div>
              ))}
              {d.ranges.length > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    update(d.weekday, (x) => ({
                      ...x,
                      ranges: [...x.ranges, { start: "18:00", end: "20:00" }],
                    }))
                  }
                  className="text-xs text-muted-foreground underline underline-offset-4"
                >
                  + add range
                </button>
              )}
              {d.ranges.length === 0 && (
                <span className="text-xs text-muted-foreground">Unavailable</span>
              )}
            </div>
          </li>
        ))}
      </ul>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save availability"}
      </Button>
    </form>
  );
}
