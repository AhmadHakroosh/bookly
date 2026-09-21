"use client";

import { XIcon } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TimezoneField } from "@/components/timezone-field";
import { saveSchedule } from "../scheduling-actions";

type Range = { start: string; end: string; focus?: boolean };
type Day = { weekday: number; label: string; ranges: Range[] };

export function ScheduleForm({
  scheduleId,
  name,
  timezone,
  zones,
  days,
  weeklyBudget,
}: {
  scheduleId: string;
  name: string;
  timezone: string;
  zones: string[];
  days: Day[];
  weeklyBudget: number | null;
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
        <label className="text-sm" htmlFor="timezone">
          <span className="mb-1 block text-xs font-medium">Hours below are in</span>
          <TimezoneField name="timezone" defaultValue={timezone} zones={zones} className="w-72" />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium">Meetings per week (budget)</span>
          <Input
            name="weeklyBudget"
            type="number"
            min={0}
            max={200}
            defaultValue={weeklyBudget ?? 0}
            className="w-32"
          />
        </label>
      </div>
      <p className="text-xs text-muted-foreground">
        0 = no budget. Ranges marked <strong>focus</strong> and any time past the weekly budget are
        offered only to priority contacts (stage active or won, or tagged <code>vip</code>) — your
        existing customers still get in, new leads see your open hours.
      </p>
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
                  <input
                    type="hidden"
                    name={`kind_${d.weekday}`}
                    value={r.focus ? "focus" : "open"}
                  />
                  <label className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={!!r.focus}
                      onChange={(e) =>
                        update(d.weekday, (x) => ({
                          ...x,
                          ranges: x.ranges.map((y, j) =>
                            j === i ? { ...y, focus: e.target.checked } : y,
                          ),
                        }))
                      }
                    />
                    focus
                  </label>
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
                    <XIcon className="size-4" aria-hidden />
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
