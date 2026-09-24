import { PageSkeleton } from "@/components/page-skeleton";
import Link from "next/link";
import { ExternalLink } from "@/components/links";
import { CheckIcon, SparklesIcon } from "lucide-react";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { SubmitButton } from "@/components/submit-button";
import { TaskList } from "@/components/task-list";
import { fmtDate, fmtDateTime, fmtTime, todayIn, utcToZoned } from "@/lib/time";
import { listOpenTasks } from "@/server/capture";
import { recapsToReview } from "@/server/recaps";
import { staleContacts } from "@/server/contacts";
import {
  getProfileByUser,
  getSchedule,
  listAllEventTypes,
  listBookings,
  listSchedules,
  locationLabel,
} from "@/server/scheduling";
import { requireStaff } from "@/server/session";
import { listWaitlist } from "@/server/waitlist";
import { getCurrentWorkspace } from "@/server/workspace";
import { hostConfirm, replyInstead, snoozeContact } from "./scheduling-actions";

/** The Meeting Inbox: what needs the host's attention today, with one-click actions. */
async function AdminInbox() {
  const [{ session, role }, workspace] = await Promise.all([requireStaff(), getCurrentWorkspace()]);
  if (!workspace) return null;
  const mine = role !== "owner" && role !== "admin";
  const profile = await getProfileByUser(workspace.id, session.user.id);
  const tz = profile?.timezone ?? workspace.timezone;
  const [schedules, events, upcoming, stale, tasks, waitlist, recaps] = await Promise.all([
    profile ? listSchedules(workspace.id, session.user.id) : Promise.resolve([]),
    listAllEventTypes(workspace.id),
    listBookings(workspace.id, {
      upcoming: true,
      userId: mine ? session.user.id : undefined,
      limit: 60,
    }),
    staleContacts(workspace.id),
    listOpenTasks(workspace.id, { userId: session.user.id, limit: 30 }),
    listWaitlist(workspace.id, mine ? session.user.id : undefined),
    recapsToReview(workspace.id, mine ? session.user.id : undefined),
  ]);
  const full = await Promise.all(schedules.map((s) => getSchedule(s.id)));
  const hasHours = full.some((s) => (s?.rules.length ?? 0) > 0);
  const active = events.filter((e) => e.active);
  const ready = !!profile && hasHours && active.length > 0;
  const now = new Date();
  const today = todayIn(tz);
  const pending = upcoming.filter((b) => b.status === "pending");
  const confirmed = upcoming.filter((b) => b.status === "confirmed");
  const todays = confirmed.filter((b) => utcToZoned(b.startAt, tz).date === today);
  const later = confirmed.filter((b) => !todays.includes(b)).slice(0, 8);
  const overdue = tasks.filter((t) => t.dueAt && t.dueAt < now);

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
        ? "Weekly hours are set."
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

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Inbox</h1>
          <p className="text-sm text-muted-foreground">
            {fmtDate(now, tz)} · {todays.length} meeting{todays.length === 1 ? "" : "s"} today ·{" "}
            {pending.length} request{pending.length === 1 ? "" : "s"} · {overdue.length} overdue
            task
            {overdue.length === 1 ? "" : "s"} · {stale.length} to follow up
          </p>
        </div>
        {profile && <ExternalLink href={`/${profile.username}`}>Your booking page</ExternalLink>}
      </div>

      {!ready && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold tracking-tight">Get started</h2>
          <ol className="divide-y rounded-xl border">
            {steps.map((s, i) => (
              <li key={s.href}>
                <Link href={s.href} className="flex items-start gap-4 p-4 hover:bg-muted/40">
                  <span
                    className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium ${s.done ? "bg-foreground text-background" : "border text-muted-foreground"}`}
                    aria-hidden
                  >
                    {s.done ? <CheckIcon className="size-3.5" aria-hidden /> : i + 1}
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
      )}

      {pending.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold tracking-tight">Requests</h2>
          <ul className="space-y-2">
            {pending.map((b) => (
              <li key={b.id} className="rounded-xl border p-4 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">
                      {b.eventTitle ?? "Meeting"} with{" "}
                      {b.contactId ? (
                        <Link href={`/admin/contacts/${b.contactId}`} className="hover:underline">
                          {b.attendeeName}
                        </Link>
                      ) : (
                        b.attendeeName
                      )}
                    </p>
                    <p className="text-muted-foreground">
                      {fmtDateTime(b.startAt, tz)}
                      {b.notes ? ` · “${b.notes}”` : ""}
                    </p>
                    {Object.values(b.answers).filter(Boolean).length > 0 && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {Object.values(b.answers).filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/admin/bookings/${b.id}`}
                      className="text-sm underline underline-offset-4"
                    >
                      Brief
                    </Link>
                    <form action={hostConfirm.bind(null, b.id)}>
                      <SubmitButton>Accept</SubmitButton>
                    </form>
                  </div>
                </div>
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-muted-foreground">
                    Reply by email instead of meeting
                  </summary>
                  <form
                    action={replyInstead.bind(null, b.id)}
                    className="mt-2 flex flex-col gap-2 sm:flex-row"
                  >
                    <textarea
                      name="message"
                      rows={2}
                      placeholder="Thanks for reaching out — here is the short answer…"
                      className="flex-1 rounded-lg border bg-background px-3 py-2 text-sm"
                    />
                    <SubmitButton variant="outline">Send &amp; withdraw request</SubmitButton>
                  </form>
                </details>
              </li>
            ))}
          </ul>
        </section>
      )}
      {recaps.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold tracking-tight">Recaps to review</h2>
          <ul className="divide-y rounded-xl border text-sm">
            {recaps.map((x) => (
              <li key={x.id} className="flex flex-wrap items-start justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="font-medium">
                    {x.eventTitle ?? "Meeting"} with {x.booking.attendeeName} ·{" "}
                    {fmtDateTime(x.booking.startAt, tz)}
                  </p>
                  <p className="line-clamp-2 text-muted-foreground">{x.recap.summary}</p>
                  <p className="text-xs text-muted-foreground">
                    {x.recap.actions.length} action item{x.recap.actions.length === 1 ? "" : "s"}
                    {x.recap.nextStep ? ` · next: ${x.recap.nextStep}` : ""}
                  </p>
                </div>
                <Link
                  href={`/admin/bookings/${x.booking.id}`}
                  className="text-sm underline underline-offset-4"
                >
                  Review
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Today</h2>
        {todays.length === 0 ? (
          <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
            No meetings today.
          </p>
        ) : (
          <ul className="divide-y rounded-xl border text-sm">
            {todays.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="font-medium">
                    {fmtTime(b.startAt, tz)} · {b.eventTitle ?? "Meeting"} with{" "}
                    {b.contactId ? (
                      <Link href={`/admin/contacts/${b.contactId}`} className="hover:underline">
                        {b.attendeeName}
                      </Link>
                    ) : (
                      b.attendeeName
                    )}
                  </p>
                  <p className="text-muted-foreground">
                    {b.meetingUrl ?? locationLabel(b.location)}
                  </p>
                  {b.brief && (
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      <span className="mr-1 inline-flex items-center gap-0.5 rounded border px-1 align-middle text-[10px] leading-4">
                        <SparklesIcon className="size-2.5" aria-hidden />
                        AI
                      </span>
                      {b.brief}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {b.meetingUrl && <ExternalLink href={b.meetingUrl}>Join</ExternalLink>}
                  <Link
                    href={`/admin/bookings/${b.id}`}
                    className="text-sm underline underline-offset-4"
                  >
                    {b.endAt < now ? "Notes" : "Brief"}
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
        {later.length > 0 && (
          <details>
            <summary className="cursor-pointer text-sm text-muted-foreground">
              Coming up ({confirmed.length - todays.length})
            </summary>
            <ul className="mt-2 divide-y rounded-xl border text-sm">
              {later.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-3 px-4 py-2">
                  <span>
                    {fmtDateTime(b.startAt, tz)} · {b.eventTitle ?? "Meeting"} with {b.attendeeName}
                  </span>
                  <Link
                    href={`/admin/bookings/${b.id}`}
                    className="text-xs underline underline-offset-4"
                  >
                    Brief
                  </Link>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-3">
          <h2 className="text-lg font-semibold tracking-tight">Follow up</h2>
          {stale.length === 0 ? (
            <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
              Nobody is waiting on you.
            </p>
          ) : (
            <ul className="divide-y rounded-xl border text-sm">
              {stale.map((c) => {
                const due = c.nextFollowUpAt && c.nextFollowUpAt <= now;
                return (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <Link
                        href={`/admin/contacts/${c.id}`}
                        className="font-medium hover:underline"
                      >
                        {c.name || c.email}
                      </Link>
                      {c.company && <span className="text-muted-foreground"> · {c.company}</span>}
                      <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-muted-foreground">
                        <span>
                          {due
                            ? `Follow-up due ${fmtDate(c.nextFollowUpAt!, tz)}`
                            : `Quiet since ${fmtDate(c.lastActivityAt, tz)}`}
                          {" ·"}
                        </span>
                        <Badge variant="secondary" className="capitalize">
                          {c.stage}
                        </Badge>
                        {c.emailOptOut && <Badge variant="outline">No email</Badge>}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/admin/contacts/${c.id}?compose=followup`}
                        className="text-sm underline underline-offset-4"
                      >
                        Follow up
                      </Link>
                      <form action={snoozeContact.bind(null, c.id, 7)}>
                        <SubmitButton variant="ghost">Snooze 7d</SubmitButton>
                      </form>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        <TaskList tasks={tasks} tz={tz} path="/admin" title="Tasks" />
      </div>

      {waitlist.length > 0 && (
        <p className="text-sm text-muted-foreground">
          {waitlist.length} {waitlist.length === 1 ? "person is" : "people are"} on a waitlist.{" "}
          <Link href="/admin/bookings" className="underline underline-offset-4">
            See bookings
          </Link>
        </p>
      )}
    </div>
  );
}

export default function AdminInboxBoundary() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <AdminInbox />
    </Suspense>
  );
}
