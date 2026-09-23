"use client";

import { PlusIcon, Trash2Icon } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TimezoneField } from "@/components/timezone-field";
import { saveSchedule } from "../scheduling-actions";
import { TimePicker } from "@/components/time-picker";
import { NumberField } from "@/components/number-field";

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
      <div className="grid gap-3 sm:grid-cols-[1fr_1.4fr_9rem]">
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium">Schedule name</span>
          <Input name="name" defaultValue={name} />
        </label>
        <label className="text-sm" htmlFor="timezone">
          <span className="mb-1 block text-xs font-medium">Hours below are in</span>
          <TimezoneField name="timezone" defaultValue={timezone} zones={zones} className="w-full" />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium">Meetings per week</span>
          <NumberField
            name="weeklyBudget"
            min={0}
            max={200}
            defaultValue={weeklyBudget ?? 0}
            unit="budget"
            ariaLabel="Meetings per week"
          />
        </label>
      </div>
      <p className="text-xs text-muted-foreground">
        0 = no budget. Ranges marked <strong>focus</strong> and any time past the weekly budget are
        offered only to priority contacts (stage active or won, or tagged <code>vip</code>) — your
        existing customers still get in, new leads see your open hours.
      </p>
      <ul className="divide-y rounded-xl border">
        {/* Small screens: the day on its own line, each range on the line beneath. */}
        {rows.map((d) => (
          <li key={d.weekday} className="flex flex-wrap items-start gap-2 p-3 text-sm sm:gap-3">
            <label className="inline-flex basis-full items-center gap-2 sm:h-8 sm:w-32 sm:basis-auto">
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
            <div className="min-w-0 flex-1 space-y-2">
              {d.ranges.map((r, i) => (
                <div key={i} className="flex items-center gap-2">
                  <TimePicker
                    name={`start_${d.weekday}`}
                    value={r.start}
                    required
                    ariaLabel="From"
                    className="min-w-0 flex-1 sm:w-28 sm:flex-none"
                    onValueChange={(v) =>
                      update(d.weekday, (x) => ({
                        ...x,
                        ranges: x.ranges.map((y, j) => (j === i ? { ...y, start: v } : y)),
                      }))
                    }
                  />
                  <span className="text-muted-foreground">–</span>
                  <TimePicker
                    name={`end_${d.weekday}`}
                    value={r.end}
                    required
                    ariaLabel="To"
                    className="min-w-0 flex-1 sm:w-28 sm:flex-none"
                    onValueChange={(v) =>
                      update(d.weekday, (x) => ({
                        ...x,
                        ranges: x.ranges.map((y, j) => (j === i ? { ...y, end: v } : y)),
                      }))
                    }
                  />
                  <input
                    type="hidden"
                    name={`kind_${d.weekday}`}
                    value={r.focus ? "focus" : "open"}
                  />
                  <label className="inline-flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
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
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() =>
                      update(d.weekday, (x) => ({
                        ...x,
                        ranges: x.ranges.filter((_, j) => j !== i),
                      }))
                    }
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                    aria-label="Remove range"
                  >
                    <Trash2Icon />
                  </Button>
                </div>
              ))}
              {d.ranges.length > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    update(d.weekday, (x) => ({
                      ...x,
                      ranges: [...x.ranges, { start: "18:00", end: "20:00" }],
                    }))
                  }
                >
                  <PlusIcon /> Add range
                </Button>
              )}
              {d.ranges.length === 0 && (
                <span className="block text-xs text-muted-foreground sm:pt-2">Unavailable</span>
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
