import { AvailabilitySkeleton } from "@/components/skeletons/pages";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { SubmitButton } from "@/components/submit-button";
import { minToHHMM, timezoneList } from "@/lib/time";
import { Input } from "@/components/ui/input";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { isCollaborator } from "@/lib/roles";
import { listRoutingForms } from "@/server/routing";
import { routeAnswers } from "@/server/routing-rules";
import {
  ensureDefaultSchedule,
  getProfileByUser,
  getSchedule,
  listAllEventTypes,
  listOverrides,
  listProfiles,
  listSchedules,
} from "@/server/scheduling";
import { requireWorkspaceUser } from "@/server/session";
import { getCurrentWorkspace } from "@/server/workspace";
import {
  createSchedule,
  deleteSchedule,
  removeOverride,
  setDefaultSchedule,
} from "../scheduling-actions";
import { createRoutingForm } from "../routing/actions";
import { AvailabilityHeader, type AvailabilityTab } from "./header";
import { OverrideForm } from "./override-form";
import { RoutingPreview, type PreviewForm } from "./routing-preview";
import { ScheduleForm } from "./schedule-form";

export const metadata = { title: "Availability & routing" };

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

async function AvailabilityPage({ searchParams }: PageProps<"/admin/availability">) {
  const [{ session, role }, ws, sp] = await Promise.all([
    requireWorkspaceUser(),
    getCurrentWorkspace(),
    searchParams,
  ]);
  if (!ws) return null;
  const profile = await getProfileByUser(ws.id, session.user.id);
  if (!profile) redirect("/admin/profile?setup=1");
  const tab: AvailabilityTab = sp.tab === "overrides" || sp.tab === "priority" ? sp.tab : "hours";
  const routing = !isCollaborator(role);
  const fallback = await ensureDefaultSchedule(ws.id, session.user.id, profile.timezone);
  const all = await listSchedules(ws.id, session.user.id);
  const wanted = typeof sp.schedule === "string" ? sp.schedule : null;
  const current = all.find((x) => x.id === wanted) ?? all.find((x) => x.isDefault) ?? fallback;
  const s = await getSchedule(current.id);
  if (!s) return null;
  const scheduleHref = (id: string | null) => {
    const q = new URLSearchParams();
    if (id) q.set("schedule", id);
    if (tab !== "hours") q.set("tab", tab);
    const str = q.toString();
    return `/admin/availability${str ? `?${str}` : ""}`;
  };
  const form = {
    scheduleId: s.id,
    name: s.name,
    timezone: s.timezone,
    zones: timezoneList(),
    weeklyBudget: s.weeklyBudget,
    days: DAYS.map((label, wd) => ({
      weekday: wd,
      label,
      ranges: s.rules
        .filter((r) => r.weekday === wd)
        .map((r) => ({
          start: minToHHMM(r.startMin),
          end: minToHHMM(r.endMin),
          focus: r.kind === "focus",
        })),
    })),
  };

  return (
    <div className="space-y-6">
      <AvailabilityHeader current={tab} routing={routing} schedule={s.isDefault ? null : s.id} />
      <section aria-label="Schedules" className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SegmentedTabs
            label="Schedules"
            items={all.map((x) => ({
              href: scheduleHref(x.isDefault ? null : x.id),
              label: x.isDefault ? `${x.name} (default)` : x.name,
              active: x.id === s.id,
            }))}
          />
          <form action={createSchedule} className="flex items-center gap-2">
            <Input
              name="name"
              placeholder="e.g. Evenings"
              aria-label="New schedule name"
              size="sm"
              className="w-40"
            />
            <SubmitButton variant="outline" size="sm">
              Add schedule
            </SubmitButton>
          </form>
        </div>
        <p className="text-xs text-muted-foreground">
          Event types use the default schedule unless they pick another one. A new schedule starts
          as a copy of the default.
        </p>
        {!s.isDefault && (
          <div className="flex flex-wrap gap-2">
            <form action={setDefaultSchedule.bind(null, s.id)}>
              <SubmitButton variant="outline" size="sm">
                Make default
              </SubmitButton>
            </form>
            <form action={deleteSchedule.bind(null, s.id)}>
              <SubmitButton variant="ghost" size="sm" className="text-destructive">
                Delete this schedule
              </SubmitButton>
            </form>
          </div>
        )}
      </section>

      {tab === "hours" && (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <section
            aria-labelledby="hours-title"
            className="min-w-0 space-y-4 rounded-xl border bg-card p-5 md:p-6"
          >
            <div>
              <h2 id="hours-title" className="text-lg font-semibold tracking-tight">
                Weekly hours
              </h2>
              <p className="text-sm text-muted-foreground">
                Turn on the days you take calls and set the hours. Bookings, buffers and minimum
                notice come off these hours automatically.
              </p>
            </div>
            <ScheduleForm key={s.id} view="hours" {...form} />
          </section>
          {routing && <RoutingAside workspaceId={ws.id} />}
        </div>
      )}

      {tab === "overrides" && (
        <section
          aria-labelledby="overrides-title"
          className="max-w-2xl space-y-4 rounded-xl border bg-card p-5 md:p-6"
        >
          <div>
            <h2 id="overrides-title" className="text-lg font-semibold tracking-tight">
              Date overrides
            </h2>
            <p className="text-sm text-muted-foreground">
              Block a day off, or open different hours on a specific date.
            </p>
          </div>
          <OverrideForm scheduleId={s.id} multi={all.length > 1} />
          <Overrides schedule={s} all={all} />
        </section>
      )}

      {tab === "priority" && (
        <section
          aria-labelledby="priority-title"
          className="max-w-2xl space-y-5 rounded-xl border bg-card p-5 md:p-6"
        >
          <div>
            <h2 id="priority-title" className="text-lg font-semibold tracking-tight">
              Priority rules
            </h2>
            <p className="text-sm text-muted-foreground">
              Priority contacts are clients whose stage is active or won, or who are tagged{" "}
              <code>vip</code>. Your existing customers still get in when new leads only see your
              open hours.
            </p>
          </div>
          <ScheduleForm key={s.id} view="priority" {...form} />
        </section>
      )}
    </div>
  );
}

/** The schedule's date overrides; one present with the same hours everywhere shows once. */
async function Overrides({
  schedule: s,
  all,
}: {
  schedule: NonNullable<Awaited<ReturnType<typeof getSchedule>>>;
  all: Awaited<ReturnType<typeof listSchedules>>;
}) {
  const others = await listOverrides(all.filter((x) => x.id !== s.id).map((x) => x.id));
  const everywhere = (o: (typeof s.overrides)[number]) =>
    all.length > 1 &&
    all
      .filter((x) => x.id !== s.id)
      .every((x) =>
        others.some(
          (p) =>
            p.scheduleId === x.id &&
            p.date === o.date &&
            p.startMin === o.startMin &&
            p.endMin === o.endMin,
        ),
      );
  if (!s.overrides.length) return <p className="text-sm text-muted-foreground">No overrides.</p>;
  return (
    <ul className="divide-y rounded-xl border text-sm">
      {s.overrides.map((o) => (
        <li key={o.id} className="flex items-center justify-between gap-3 px-4 py-2">
          <span>
            <span className="font-medium tabular-nums">{o.date}</span>
            <span className="text-muted-foreground">
              {" · "}
              {o.startMin === null
                ? "Unavailable"
                : `${minToHHMM(o.startMin)}–${minToHHMM(o.endMin!)}`}
              {everywhere(o) && " · all schedules"}
            </span>
          </span>
          <form action={removeOverride.bind(null, o.id, everywhere(o))}>
            <SubmitButton variant="ghost" size="sm">
              {everywhere(o) ? "Remove everywhere" : "Remove"}
            </SubmitButton>
          </form>
        </li>
      ))}
    </ul>
  );
}

/** The routing form preview, or the way to make a first form. */
async function RoutingAside({ workspaceId }: { workspaceId: string }) {
  const forms = await listRoutingForms(workspaceId);
  if (!forms.length)
    return (
      <section className="space-y-3 rounded-xl border bg-card p-5">
        <h2 className="text-sm font-semibold">Routing form preview</h2>
        <p className="text-sm text-muted-foreground">
          Ask a question or two before people book, and send each answer to the right event type,
          link or message.
        </p>
        <form action={createRoutingForm}>
          <SubmitButton variant="outline" size="sm">
            Create a routing form
          </SubmitButton>
        </form>
      </section>
    );
  const [types, profiles] = await Promise.all([
    listAllEventTypes(workspaceId),
    listProfiles(workspaceId),
  ]);
  const preview: PreviewForm[] = [...forms]
    .sort((a, b) => Number(b.active) - Number(a.active))
    .map((f) => {
      const q = f.questions.find((x) => x.type === "select" && x.options?.length);
      return {
        id: f.id,
        name: f.name,
        slug: f.slug,
        active: f.active,
        question: q
          ? {
              label: q.label,
              options: q.options!.map((value) => {
                const d = routeAnswers(f, { [q.id]: value });
                if (!d) return { value, to: null };
                if (d.type === "url")
                  return { value, to: { kind: "url" as const, host: hostOf(d.url) } };
                if (d.type === "message")
                  return { value, to: { kind: "message" as const, text: d.text } };
                const et = types.find((t) => t.id === d.eventTypeId);
                const host = profiles.find((p) => p.userId === et?.userId);
                return {
                  value,
                  to: et
                    ? {
                        kind: "event" as const,
                        title: et.title,
                        host: host?.displayName ?? et.title,
                        avatarUrl: host?.avatarUrl ?? null,
                      }
                    : null,
                };
              }),
            }
          : null,
      };
    });
  return <RoutingPreview forms={preview} />;
}

const hostOf = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

export default function AvailabilityPageBoundary(props: PageProps<"/admin/availability">) {
  return (
    <Suspense fallback={<AvailabilitySkeleton />}>
      <AvailabilityPage {...props} />
    </Suspense>
  );
}
