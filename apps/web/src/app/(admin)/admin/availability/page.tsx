import { redirect } from "next/navigation";
import { Suspense } from "react";
import { SubmitButton } from "@/components/submit-button";
import { minToHHMM, timezoneList } from "@/lib/time";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  ensureDefaultSchedule,
  getProfileByUser,
  getSchedule,
  listSchedules,
} from "@/server/scheduling";
import { requireStaff } from "@/server/session";
import { getCurrentWorkspace } from "@/server/workspace";
import {
  addOverride,
  createSchedule,
  deleteSchedule,
  removeOverride,
  setDefaultSchedule,
} from "../scheduling-actions";
import { ScheduleForm } from "./schedule-form";
import { PageSkeleton } from "@/components/page-skeleton";

export const metadata = { title: "Availability" };

async function AvailabilityPage({ searchParams }: PageProps<"/admin/availability">) {
  const [{ session }, ws, sp] = await Promise.all([
    requireStaff(),
    getCurrentWorkspace(),
    searchParams,
  ]);
  if (!ws) return null;
  const profile = await getProfileByUser(ws.id, session.user.id);
  if (!profile) redirect("/admin/profile?setup=1");
  const fallback = await ensureDefaultSchedule(ws.id, session.user.id, profile.timezone);
  const all = await listSchedules(ws.id, session.user.id);
  const wanted = typeof sp.schedule === "string" ? sp.schedule : null;
  const current = all.find((x) => x.id === wanted) ?? all.find((x) => x.isDefault) ?? fallback;
  const s = await getSchedule(current.id);
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
      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {all.map((x) => (
            <Link
              key={x.id}
              href={x.isDefault ? "/admin/availability" : `/admin/availability?schedule=${x.id}`}
              aria-current={x.id === s.id ? "page" : undefined}
              className={`inline-flex h-8 items-center gap-2 rounded-lg border px-3 text-sm ${x.id === s.id ? "border-primary bg-primary/5 font-medium" : "text-muted-foreground hover:text-foreground"}`}
            >
              {x.name}
              {x.isDefault && (
                <Badge variant="secondary" className="text-[10px]">
                  Default
                </Badge>
              )}
            </Link>
          ))}
          <form action={createSchedule} className="flex items-center gap-2">
            <Input
              name="name"
              placeholder="New schedule, e.g. Evenings"
              aria-label="New schedule name"
              className="h-8 w-56"
            />
            <SubmitButton variant="outline">Add schedule</SubmitButton>
          </form>
        </div>
        <p className="text-xs text-muted-foreground">
          Event types use the default schedule unless they pick another one (Event types →
          Availability schedule). A new schedule starts as a copy of the default.
        </p>
        {!s.isDefault && (
          <div className="flex flex-wrap gap-2">
            <form action={setDefaultSchedule.bind(null, s.id)}>
              <SubmitButton variant="outline">Make default</SubmitButton>
            </form>
            <form action={deleteSchedule.bind(null, s.id)}>
              <SubmitButton variant="ghost" className="text-destructive">
                Delete this schedule
              </SubmitButton>
            </form>
          </div>
        )}
      </section>
      <ScheduleForm
        key={s.id}
        scheduleId={s.id}
        name={s.name}
        timezone={s.timezone}
        zones={timezoneList()}
        weeklyBudget={s.weeklyBudget}
        days={days.map((label, wd) => ({
          weekday: wd,
          label,
          ranges: s.rules
            .filter((r) => r.weekday === wd)
            .map((r) => ({
              start: minToHHMM(r.startMin),
              end: minToHHMM(r.endMin),
              focus: r.kind === "focus",
            })),
        }))}
      />
      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Date overrides</h2>
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
          <SubmitButton>Add</SubmitButton>
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
                <SubmitButton variant="ghost">Remove</SubmitButton>
              </form>
            </li>
          ))}
          {s.overrides.length === 0 && <li className="text-muted-foreground">No overrides.</li>}
        </ul>
      </section>
    </div>
  );
}

export default function AvailabilityPageBoundary(props: PageProps<"/admin/availability">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <AvailabilityPage {...props} />
    </Suspense>
  );
}
