import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { minToHHMM, timezoneList } from "@/lib/time";
import { ensureDefaultSchedule, getProfileByUser, getSchedule } from "@/server/scheduling";
import { requireStaff } from "@/server/session";
import { getCurrentWorkspace } from "@/server/workspace";
import { addOverride, removeOverride } from "../scheduling-actions";
import { ScheduleForm } from "./schedule-form";

export const metadata = { title: "Availability" };

async function AvailabilityPage() {
  const [{ session }, ws] = await Promise.all([requireStaff(), getCurrentWorkspace()]);
  if (!ws) return null;
  const profile = await getProfileByUser(ws.id, session.user.id);
  if (!profile) redirect("/admin/profile?setup=1");
  const s = await getSchedule(
    (await ensureDefaultSchedule(ws.id, session.user.id, profile.timezone)).id,
  );
  if (!s) return null;
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return (
    <div className="max-w-2xl space-y-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Availability</h1>
        <p className="text-sm text-muted-foreground">
          Tick the days you take calls and set the hours. Existing bookings, buffers and minimum
          notice are removed from these hours automatically.
        </p>
      </div>
      <ScheduleForm
        scheduleId={s.id}
        name={s.name}
        timezone={s.timezone}
        zones={timezoneList()}
        days={days.map((label, wd) => ({
          weekday: wd,
          label,
          ranges: s.rules
            .filter((r) => r.weekday === wd)
            .map((r) => ({ start: minToHHMM(r.startMin), end: minToHHMM(r.endMin) })),
        }))}
      />
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Date overrides</h2>
        <p className="text-sm text-muted-foreground">
          Block a day off, or open different hours on a specific date.
        </p>
        <form
          action={addOverride}
          className="flex flex-wrap items-end gap-2 rounded-xl border p-4 text-sm"
        >
          <input type="hidden" name="scheduleId" value={s.id} />
          <label className="block">
            <span className="mb-1 block text-xs font-medium">Date</span>
            <input
              type="date"
              name="date"
              required
              className="h-8 rounded-md border bg-background px-2"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium">From</span>
            <input type="time" name="start" className="h-8 rounded-md border bg-background px-2" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium">To</span>
            <input type="time" name="end" className="h-8 rounded-md border bg-background px-2" />
          </label>
          <label className="inline-flex items-center gap-1 pb-1.5">
            <input type="checkbox" name="blocked" /> Unavailable all day
          </label>
          <Button type="submit" size="sm">
            Add
          </Button>
        </form>
        <ul className="space-y-1 text-sm">
          {s.overrides.map((o) => (
            <li
              key={o.id}
              className="flex items-center justify-between rounded-md border px-3 py-1.5"
            >
              <span>
                {o.date} ·{" "}
                {o.startMin === null
                  ? "unavailable"
                  : `${minToHHMM(o.startMin)}–${minToHHMM(o.endMin!)}`}
              </span>
              <form action={removeOverride.bind(null, o.id)}>
                <Button type="submit" variant="ghost" size="sm">
                  Remove
                </Button>
              </form>
            </li>
          ))}
          {s.overrides.length === 0 && <li className="text-muted-foreground">No overrides.</li>}
        </ul>
      </section>
    </div>
  );
}

export default function AvailabilityPageBoundary() {
  return (
    <Suspense fallback={null}>
      <AvailabilityPage />
    </Suspense>
  );
}
