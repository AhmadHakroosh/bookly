"use client";

import { PlusIcon, XIcon } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { TimezoneField } from "@/components/timezone-field";
import { saveSchedule } from "../scheduling-actions";
import { TimePicker } from "@/components/time-picker";
import { NumberField } from "@/components/number-field";

type Range = { start: string; end: string; focus?: boolean };
type Day = { weekday: number; label: string; ranges: Range[] };

/**
 * One schedule, seen two ways (`mocks.png` 03). "Weekly hours" is a row per day: the hours, and
 * a switch on the right that turns the day on or off. "Priority rules" is the weekly budget and,
 * per range, whether it is kept for priority contacts. Both save the whole schedule, so each view
 * carries the other's fields as hidden inputs.
 */
export function ScheduleForm({
  view,
  scheduleId,
  name,
  timezone,
  zones,
  days,
  weeklyBudget,
}: {
  view: "hours" | "priority";
  scheduleId: string;
  name: string;
  timezone: string;
  zones: string[];
  days: Day[];
  weeklyBudget: number | null;
}) {
  const [state, action] = useActionState(saveSchedule, {} as { ok?: boolean; error?: string });
  const [rows, setRows] = useState<Day[]>(days);
  useEffect(() => {
    if (state.ok) toast.success(view === "hours" ? "Availability saved" : "Priority rules saved");
    else if (state.error) toast.error(state.error);
  }, [state, view]);
  const update = (wd: number, fn: (d: Day) => Day) =>
    setRows((r) => r.map((d) => (d.weekday === wd ? fn(d) : d)));
  const setRange = (wd: number, i: number, patch: Partial<Range>) =>
    update(wd, (x) => ({
      ...x,
      ranges: x.ranges.map((y, j) => (j === i ? { ...y, ...patch } : y)),
    }));

  // What the server reads for every range, whichever view is showing.
  const hidden = rows.map((d) =>
    d.ranges.length ? (
      <span key={d.weekday} hidden>
        <input type="hidden" name={`on_${d.weekday}`} value="1" />
        {d.ranges.map((r, i) => (
          <span key={i}>
            {view === "priority" && (
              <>
                <input type="hidden" name={`start_${d.weekday}`} value={r.start} />
                <input type="hidden" name={`end_${d.weekday}`} value={r.end} />
              </>
            )}
            <input type="hidden" name={`kind_${d.weekday}`} value={r.focus ? "focus" : "open"} />
          </span>
        ))}
      </span>
    ) : null,
  );

  if (view === "priority") {
    const open = [...rows.slice(1), rows[0]!].filter((d) => d.ranges.length);
    return (
      <form action={action} className="space-y-5">
        <input type="hidden" name="scheduleId" value={scheduleId} />
        <input type="hidden" name="name" value={name} />
        <input type="hidden" name="timezone" value={timezone} />
        {hidden}
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <div className="max-w-sm min-w-0">
            <h3 className="text-sm font-semibold">Meetings per week</h3>
            <p className="text-sm text-muted-foreground">
              Past this many bookings in a week, only priority contacts can book. 0 means no budget.
            </p>
          </div>
          <NumberField
            name="weeklyBudget"
            min={0}
            max={200}
            defaultValue={weeklyBudget ?? 0}
            unit="a week"
            ariaLabel="Meetings per week"
            className="w-44"
          />
        </div>
        <div>
          <h3 className="text-sm font-semibold">Hours for priority contacts only</h3>
          <p className="text-sm text-muted-foreground">
            Keep a range for the people you already work with; everyone else sees the rest of your
            hours.
          </p>
          {open.length ? (
            <ul className="mt-3 divide-y rounded-xl border">
              {open.flatMap((d) =>
                d.ranges.map((r, i) => (
                  <li
                    key={`${d.weekday}-${i}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
                  >
                    <span>
                      <span className="font-medium">{d.label}</span>{" "}
                      <span className="text-muted-foreground tabular-nums">
                        {r.start}–{r.end}
                      </span>
                    </span>
                    <label className="inline-flex items-center gap-2 text-muted-foreground">
                      <span className="hidden sm:inline">Priority only</span>
                      <Switch
                        checked={!!r.focus}
                        onCheckedChange={(on) => setRange(d.weekday, i, { focus: on })}
                        aria-label={`${d.label} ${r.start}–${r.end}: priority contacts only`}
                      />
                    </label>
                  </li>
                )),
              )}
            </ul>
          ) : (
            <p className="mt-3 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
              No weekly hours yet. Set them under Weekly hours first.
            </p>
          )}
        </div>
        <SubmitButton pendingText="Saving…">Save priority rules</SubmitButton>
      </form>
    );
  }

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="scheduleId" value={scheduleId} />
      <input type="hidden" name="weeklyBudget" value={weeklyBudget ?? 0} />
      {hidden}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm" htmlFor="timezone">
          <span className="mb-2 block text-sm font-medium">Time zone</span>
          <TimezoneField name="timezone" defaultValue={timezone} zones={zones} className="w-full" />
        </label>
        <label className="text-sm">
          <span className="mb-2 block text-sm font-medium">Schedule name</span>
          <Input name="name" defaultValue={name} />
        </label>
      </div>
      <ul className="@container space-y-4" aria-label="Weekly hours">
        {/* Monday first, as the concept draws the week. */}
        {[...rows.slice(1), rows[0]!].map((d) => {
          const on = d.ranges.length > 0;
          return (
            <li key={d.weekday} className="flex flex-wrap items-start gap-x-4 gap-y-1.5 text-sm">
              <span className="flex-1 font-medium @lg:w-24 @lg:flex-none @lg:pt-2">{d.label}</span>
              <div className="order-last min-w-0 basis-full space-y-2 @lg:order-none @lg:flex-1 @lg:basis-auto">
                {d.ranges.map((r, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <TimePicker
                      name={`start_${d.weekday}`}
                      value={r.start}
                      required
                      ariaLabel={`${d.label} from`}
                      className="min-w-0 flex-1 @lg:w-32 @lg:flex-none"
                      onValueChange={(v) => setRange(d.weekday, i, { start: v })}
                    />
                    <span className="text-muted-foreground">–</span>
                    <TimePicker
                      name={`end_${d.weekday}`}
                      value={r.end}
                      required
                      ariaLabel={`${d.label} to`}
                      className="min-w-0 flex-1 @lg:w-32 @lg:flex-none"
                      onValueChange={(v) => setRange(d.weekday, i, { end: v })}
                    />
                    {d.ranges.length > 1 && (
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
                        aria-label={`Remove ${d.label} ${r.start}–${r.end}`}
                      >
                        <XIcon />
                      </Button>
                    )}
                    {i === d.ranges.length - 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() =>
                          update(d.weekday, (x) => ({
                            ...x,
                            ranges: [...x.ranges, { start: "18:00", end: "20:00" }],
                          }))
                        }
                        className="shrink-0 text-muted-foreground"
                        aria-label={`Add hours on ${d.label}`}
                      >
                        <PlusIcon />
                      </Button>
                    )}
                  </div>
                ))}
                {!on && (
                  <span className="flex h-10 items-center rounded-lg bg-muted px-3 text-muted-foreground @lg:w-[16.75rem]">
                    Unavailable
                  </span>
                )}
              </div>
              <Switch
                className="@lg:mt-3"
                checked={on}
                onCheckedChange={(next) =>
                  update(d.weekday, (x) => ({
                    ...x,
                    ranges: next ? [{ start: "09:00", end: "17:00" }] : [],
                  }))
                }
                aria-label={`Available on ${d.label}`}
              />
            </li>
          );
        })}
      </ul>
      <SubmitButton pendingText="Saving…">Save availability</SubmitButton>
    </form>
  );
}
