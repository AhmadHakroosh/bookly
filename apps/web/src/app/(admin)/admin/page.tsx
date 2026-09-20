import Link from "next/link";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import {
  getProfileByUser,
  getSchedule,
  listAllEventTypes,
  listSchedules,
} from "@/server/scheduling";
import { requireStaff } from "@/server/session";
import { getCurrentWorkspace } from "@/server/workspace";

async function AdminDashboard() {
  const [{ session }, workspace] = await Promise.all([requireStaff(), getCurrentWorkspace()]);
  if (!workspace) return null;
  const profile = await getProfileByUser(workspace.id, session.user.id);
  const [schedules, events] = profile
    ? await Promise.all([
        listSchedules(workspace.id, session.user.id),
        listAllEventTypes(workspace.id),
      ])
    : [[], []];
  const full = await Promise.all(schedules.map((s) => getSchedule(s.id)));
  const hasHours = full.some((s) => (s?.rules.length ?? 0) > 0);
  const active = events.filter((e) => e.active);
  const appUrl = process.env.APP_URL ?? "";
  const pageUrl = profile ? `${appUrl}/${profile.username}` : null;

  const steps: { title: string; detail: string; href: string; done: boolean }[] = [
    {
      title: "Set up your booking page",
      detail: profile
        ? `Live at /${profile.username} · ${profile.timezone}`
        : "Choose a username, display name and your timezone.",
      href: "/admin/profile",
      done: !!profile,
    },
    {
      title: "Set your weekly hours",
      detail: hasHours
        ? "Weekly hours are set. Add date overrides for days off."
        : "Tick the days you take calls and the hours you are free.",
      href: "/admin/availability",
      done: hasHours,
    },
    {
      title: "Create an event type",
      detail:
        active.length > 0
          ? `${active.length} event type${active.length === 1 ? "" : "s"} people can book.`
          : "For example a free 30-minute intro call.",
      href: "/admin/event-types",
      done: active.length > 0,
    },
  ];
  const ready = steps.every((s) => s.done);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          {workspace.name} · {workspace.timezone}
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{ready ? "You are set up" : "Get started"}</h2>
        <ol className="divide-y rounded-xl border">
          {steps.map((s, i) => (
            <li key={s.href}>
              <Link href={s.href} className="flex items-start gap-4 p-4 hover:bg-muted/40">
                <span
                  className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium ${
                    s.done ? "bg-foreground text-background" : "border text-muted-foreground"
                  }`}
                  aria-hidden
                >
                  {s.done ? "✓" : i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{s.title}</span>
                  <span className="block text-sm text-muted-foreground">{s.detail}</span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </section>

      {ready && pageUrl && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Share your page</h2>
          <div className="space-y-3 rounded-xl border p-4 text-sm">
            <p>
              Your booking page:{" "}
              <a
                href={pageUrl}
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-4"
              >
                {pageUrl}
              </a>
            </p>
            <p className="text-muted-foreground">
              Each event type also has its own link, for example{" "}
              <span className="font-mono">
                {pageUrl}/{active[0]?.slug}
              </span>
              . To embed a booking button on your website see the{" "}
              <a
                href="https://github.com/AhmadHakroosh/bookly/blob/main/docs/embeds.md"
                className="underline underline-offset-4"
                target="_blank"
                rel="noreferrer"
              >
                embed guide
              </a>
              .
            </p>
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Next</h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          <li className="rounded-xl border p-4">
            <p className="font-medium">Bookings </p>
            <p className="text-sm text-muted-foreground">
              See upcoming and past bookings, confirm or cancel them.{" "}
              <Link href="/admin/bookings" className="underline underline-offset-4">
                Open
              </Link>
            </p>
          </li>
          <li className="rounded-xl border p-4">
            <p className="font-medium">
              Calendars &amp; conferencing <Badge variant="secondary">Coming soon</Badge>
            </p>
            <p className="text-sm text-muted-foreground">
              Google Calendar, Outlook, Meet, Zoom, Teams and built-in video.
            </p>
          </li>
        </ul>
      </section>
    </div>
  );
}

export default function AdminDashboardBoundary() {
  return (
    <Suspense fallback={null}>
      <AdminDashboard />
    </Suspense>
  );
}
