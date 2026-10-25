import { HomeSkeleton } from "@/components/skeletons/pages";
import Link from "next/link";
import {
  CalendarIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleCheckIcon,
  ClockIcon,
  ExternalLinkIcon,
  FileTextIcon,
  ListChecksIcon,
  MapPinIcon,
  PhoneIcon,
  SparklesIcon,
  UsersIcon,
  VideoIcon,
} from "lucide-react";
import { Suspense } from "react";
import { connection } from "next/server";
import { and, eq, inArray, schema } from "@bookly/db";
import { db } from "@/lib/db";
import { SubmitButton } from "@/components/submit-button";
import { DatePicker } from "@/components/date-picker";
import {
  addDays,
  fmtDateTime,
  fmtTime,
  formatInTz,
  todayIn,
  utcToZoned,
  zonedToUtc,
} from "@/lib/time";
import { listOpenTasks } from "@/server/capture";
import { recapsToReview } from "@/server/recaps";
import { staleContacts } from "@/server/contacts";
import { stageChoices } from "@/server/pipelines";
import {
  getProfileByUser,
  getSchedule,
  listAllEventTypes,
  listBookings,
  listSchedules,
  locationLabel,
} from "@/server/scheduling";
import { formatPrice } from "@/server/payments";
import { requireStaff } from "@/server/session";
import { listWaitlist } from "@/server/waitlist";
import { getCurrentWorkspace } from "@/server/workspace";
import { hasFlag } from "@/server/flags";
import { canGuest, canTeam, listThreads } from "@/server/messages";
import { CreateMenu } from "./create-menu";
import { KeepMovingMenu, NextSteps, type NextStep } from "./home-lists";
import { addTaskAction, hostConfirm, replyInstead } from "./scheduling-actions";
import { Agenda, AgendaItem } from "@/components/ui/agenda";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ListRow } from "@/components/ui/list-row";
import { PageHeader } from "@/components/ui/page-header";
import { RecapCard } from "@/components/ui/recap-card";
import { Stat, StatStrip } from "@/components/ui/stat-strip";
import { StatusChip } from "@/components/ui/status-chip";

/*
 * Home (`app ui.png`, concept-fidelity.md §4.1): the greeting and the day's counts, the day as a
 * timeline with Join and Open briefing beside each meeting, the people waiting on the host, and
 * on the right the next steps, recent conversations and the recap to review. Booking requests
 * sit above the day while there are any: the concept has none, and they need an answer.
 */

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function greeting(tz: string, now: Date) {
  const hour = Number(formatInTz(now, tz, { hour: "numeric", hourCycle: "h23" }));
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

/** A card on Home: a heading, an optional "View all ›", and its content. */
function Card({
  title,
  id,
  more,
  children,
  className = "",
}: {
  title: React.ReactNode;
  id: string;
  more?: { href: string; label?: string };
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className={`scroll-mt-20 rounded-xl border bg-card p-5 ${className}`}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id={`${id}-title`} className="text-lg font-semibold tracking-tight">
          {title}
        </h2>
        {more && (
          <Link
            href={more.href}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            {more.label ?? "View all"}
            <ChevronRightIcon className="size-4" aria-hidden />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

const LOCATION_ICON = {
  phone: PhoneIcon,
  in_person: MapPinIcon,
} as Record<string, typeof VideoIcon>;

async function AdminHome({ searchParams }: PageProps<"/admin">) {
  const [{ session, role }, workspace, sp] = await Promise.all([
    requireStaff(),
    getCurrentWorkspace(),
    searchParams,
  ]);
  if (!workspace) return null;
  // Home is about now: render it per request (the clock, today's meetings).
  await connection();
  const mine = role !== "owner" && role !== "admin";
  const profile = await getProfileByUser(workspace.id, session.user.id);
  const tz = profile?.timezone ?? workspace.timezone;
  const now = new Date();
  const today = todayIn(tz);
  const day = typeof sp.day === "string" && DAY.test(sp.day) ? sp.day : today;
  const [taskBoard, messagesFlag] = await Promise.all([
    hasFlag(workspace, "task_board"),
    hasFlag(workspace, "messages"),
  ]);
  const messages = messagesFlag && (canGuest(workspace) || canTeam(workspace));
  const scope = { userId: mine ? session.user.id : undefined, viewer: session.user.id };
  const [schedules, events, upcoming, onDay, stale, tasks, waitlist, recaps, threads] =
    await Promise.all([
      profile ? listSchedules(workspace.id, session.user.id) : Promise.resolve([]),
      listAllEventTypes(workspace.id),
      listBookings(workspace.id, { ...scope, upcoming: true, limit: 60 }),
      listBookings(workspace.id, {
        ...scope,
        from: zonedToUtc(day, 0, tz),
        to: zonedToUtc(addDays(day, 1), 0, tz),
        limit: 40,
      }),
      staleContacts(workspace.id),
      listOpenTasks(workspace.id, { userId: session.user.id, limit: 30 }),
      listWaitlist(workspace.id, mine ? session.user.id : undefined),
      recapsToReview(workspace.id, mine ? session.user.id : undefined, 10, session.user.id),
      messages ? listThreads({ ws: workspace, userId: session.user.id }) : null,
    ]);
  const taskContacts = [...new Set(tasks.map((t) => t.contactId).filter((x): x is string => !!x))];
  const [stageNames, people] = await Promise.all([
    stageChoices(workspace),
    taskContacts.length
      ? db()
          .select({
            id: schema.contacts.id,
            name: schema.contacts.name,
            company: schema.contacts.company,
          })
          .from(schema.contacts)
          .where(
            and(
              eq(schema.contacts.workspaceId, workspace.id),
              inArray(schema.contacts.id, taskContacts),
            ),
          )
      : [],
  ]);
  const personOf = new Map(
    people.map((p) => [p.id, [p.name, p.company].filter(Boolean).join(" • ")]),
  );
  const stageName = (c: (typeof stale)[number]) => {
    const key = stageNames.keyOf(c);
    return stageNames.choices.find((s) => s.key === key)?.name ?? key;
  };
  const full = await Promise.all(schedules.map((s) => getSchedule(s.id)));
  const hasHours = full.some((s) => (s?.rules.length ?? 0) > 0);
  const active = events.filter((e) => e.active);
  const ready = !!profile && hasHours && active.length > 0;

  const pending = upcoming.filter((b) => b.status === "pending");
  const meetings = onDay.filter((b) => b.status === "confirmed");
  const todays = upcoming.filter(
    (b) => b.status === "confirmed" && utcToZoned(b.startAt, tz).date === today,
  );
  // The meeting on now, else the next one: the agenda opens on it.
  const focus = meetings.find((b) => b.endAt > now);
  const followUps = stale.filter((c) => c.nextFollowUpAt && c.nextFollowUpAt <= now);
  const firstName = (profile?.displayName || session.user.name || "").split(" ")[0];
  const dayLabel = (d: string) =>
    formatInTz(zonedToUtc(d, 12 * 60, tz), tz, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  const due = (at: Date) => {
    const d = utcToZoned(at, tz).date;
    if (d === today) return "Due today";
    if (d === addDays(today, 1)) return "Due tomorrow";
    if (at < now) return `Overdue · ${dayLabel(d)}`;
    return `Due ${dayLabel(d)}`;
  };
  // Dated tasks by due date, then the newest undated ones (a task just added shows up).
  const ordered = [
    ...tasks.filter((t) => t.dueAt),
    ...tasks.filter((t) => !t.dueAt).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
  ];
  const steps: NextStep[] = ordered.slice(0, 5).map((t) => ({
    id: t.id,
    title: t.title,
    meta: (t.contactId && personOf.get(t.contactId)) || undefined,
    due: t.dueAt ? due(t.dueAt) : undefined,
    urgent: !!t.dueAt && (t.dueAt < now || utcToZoned(t.dueAt, tz).date === today),
    href: taskBoard ? `/admin/tasks?task=${t.id}` : undefined,
  }));
  const recap = recaps[0];
  // The concept's clock: "09:30 – 10:15", so the times line up down the rail.
  const clock = (at: Date) =>
    formatInTz(at, tz, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const ago = (at: Date) => {
    const d = utcToZoned(at, tz).date;
    return d === today ? fmtTime(at, tz) : d === addDays(today, -1) ? "Yesterday" : dayLabel(d);
  };

  const setup: { title: string; detail: string; href: string; done: boolean }[] = [
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
    <div className="space-y-6">
      <PageHeader
        title={`${greeting(tz, now)}${firstName ? `, ${firstName}` : ""}.`}
        description={
          <>
            {formatInTz(now, tz, { weekday: "long", month: "long", day: "numeric" })}
            <span aria-hidden> • </span>
            <span className="sr-only">. </span>
            Here&apos;s what needs your attention.
          </>
        }
        actions={
          <>
            {profile && (
              <Button
                variant="outline"
                nativeButton={false}
                render={<a href={`/${profile.username}`} target="_blank" rel="noreferrer" />}
              >
                View booking page
                <ExternalLinkIcon data-icon="inline-end" />
                <span className="sr-only">(opens in a new tab)</span>
              </Button>
            )}
            <CreateMenu tasks={taskBoard} messages={messages} />
          </>
        }
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
        <div className="min-w-0 space-y-6">
          <StatStrip aria-label="Today at a glance">
            <Stat
              icon={CalendarIcon}
              value={todays.length}
              label={`meeting${todays.length === 1 ? "" : "s"} today`}
              href="#today"
            />
            <Stat
              icon={CircleCheckIcon}
              value={followUps.length}
              label={`follow-up${followUps.length === 1 ? "" : "s"} due`}
              href="#keep-moving"
            />
            <Stat
              icon={ListChecksIcon}
              value={tasks.length}
              label={`open task${tasks.length === 1 ? "" : "s"}`}
              href={taskBoard ? "/admin/tasks?view=mine" : "#next-steps"}
            />
          </StatStrip>

          {!ready && (
            <Card id="get-started" title="Get started">
              <ol className="divide-y rounded-lg border">
                {setup.map((s, i) => (
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
            </Card>
          )}

          <section
            id="today"
            aria-labelledby="today-title"
            className="scroll-mt-20 rounded-xl border bg-card p-5"
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 id="today-title" className="text-lg font-semibold tracking-tight">
                {day === today ? "Today" : dayLabel(day)}
              </h2>
              <nav
                aria-label="Day"
                className="flex items-center gap-1 text-sm text-muted-foreground"
              >
                {day !== today ? (
                  <Link href="/admin#today" className="me-2 hover:text-foreground">
                    Back to today
                  </Link>
                ) : (
                  <span className="me-2">{dayLabel(day)}</span>
                )}
                <Link
                  href={`/admin?day=${addDays(day, -1)}#today`}
                  aria-label="Previous day"
                  className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
                >
                  <ChevronLeftIcon />
                </Link>
                <Link
                  href={`/admin?day=${addDays(day, 1)}#today`}
                  aria-label="Next day"
                  className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
                >
                  <ChevronRightIcon />
                </Link>
              </nav>
            </div>
            {meetings.length === 0 ? (
              <EmptyState
                size="sm"
                icon={CalendarIcon}
                title={day === today ? "No meetings today." : "No meetings this day."}
                description="New bookings show up here on the day."
              />
            ) : (
              <Agenda>
                {meetings.map((b) => {
                  const live = b.startAt <= now && b.endAt > now;
                  const soon =
                    !live && b.startAt > now && b.startAt.getTime() - now.getTime() < 3_600_000;
                  const minutes = Math.round((b.endAt.getTime() - b.startAt.getTime()) / 60_000);
                  const people = 1 + b.guests.length;
                  const Where = LOCATION_ICON[b.location.type] ?? VideoIcon;
                  const past = b.endAt <= now;
                  return (
                    <AgendaItem
                      key={b.id}
                      time={clock(b.startAt)}
                      end={clock(b.endAt)}
                      dateTime={b.startAt.toISOString()}
                      active={b.id === focus?.id}
                      title={
                        <Link href={`/admin/bookings/${b.id}`} className="hover:underline">
                          {b.eventTitle ?? "Meeting"}
                        </Link>
                      }
                      badge={
                        live ? (
                          <StatusChip tone="accent" dot>
                            Now
                          </StatusChip>
                        ) : soon ? (
                          <StatusChip tone="accent">
                            In{" "}
                            {Math.max(
                              1,
                              Math.round((b.startAt.getTime() - now.getTime()) / 60_000),
                            )}{" "}
                            min
                          </StatusChip>
                        ) : b.contactId && stale.some((c) => c.id === b.contactId) ? (
                          <StatusChip tone="info">Follow-up due</StatusChip>
                        ) : undefined
                      }
                      subtitle={
                        <>
                          {b.contactId ? (
                            <Link
                              href={`/admin/contacts/${b.contactId}`}
                              className="hover:underline"
                            >
                              {b.attendeeName}
                            </Link>
                          ) : (
                            b.attendeeName
                          )}
                          {b.contactCompany && <> / {b.contactCompany}</>}
                        </>
                      }
                      meta={
                        <>
                          <span className="inline-flex items-center gap-1.5">
                            <Where className="size-3.5" aria-hidden />
                            {locationLabel(b.location)}
                          </span>
                          <span className="inline-flex items-center gap-1.5">
                            <ClockIcon className="size-3.5" aria-hidden />
                            {minutes} min
                          </span>
                          <span className="inline-flex items-center gap-1.5">
                            <UsersIcon className="size-3.5" aria-hidden />
                            {people} {people === 1 ? "person" : "people"}
                          </span>
                          {b.paymentStatus && b.amountCents != null && (
                            <span>
                              {formatPrice(b.amountCents, b.currency)}{" "}
                              {b.paymentStatus === "refunded"
                                ? "refunded"
                                : b.paymentStatus === "paid"
                                  ? "paid"
                                  : "unpaid"}
                            </span>
                          )}
                        </>
                      }
                      actions={
                        <>
                          {b.meetingUrl && !past && (
                            <Button
                              variant="ink"
                              size="sm"
                              nativeButton={false}
                              render={<a href={b.meetingUrl} target="_blank" rel="noreferrer" />}
                            >
                              <VideoIcon data-icon="inline-start" />
                              Join meeting
                              <span className="sr-only">(opens in a new tab)</span>
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            nativeButton={false}
                            render={<Link href={`/admin/bookings/${b.id}`} />}
                          >
                            <FileTextIcon data-icon="inline-start" />
                            {past ? "Open notes" : "Open briefing"}
                          </Button>
                        </>
                      }
                    >
                      {b.id === focus?.id && b.brief && (
                        <div className="rounded-lg border bg-card/80 p-3 text-sm">
                          <p className="flex items-center gap-2 font-medium">
                            Pick up where you left off
                            <span className="inline-flex items-center gap-0.5 rounded border px-1 text-[10px] leading-4 text-muted-foreground">
                              <SparklesIcon className="size-2.5" aria-hidden />
                              AI
                            </span>
                          </p>
                          <p className="mt-1 line-clamp-4 text-muted-foreground">{b.brief}</p>
                        </div>
                      )}
                    </AgendaItem>
                  );
                })}
              </Agenda>
            )}
          </section>

          {pending.length > 0 && (
            <Card
              id="requests"
              title={`Requests (${pending.length})`}
              more={pending.length > 3 ? { href: "/admin/bookings?view=requests" } : undefined}
            >
              <ul className="divide-y">
                {pending.slice(0, 3).map((b) => (
                  <li key={b.id} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 text-sm">
                        <p className="font-medium">
                          {b.eventTitle ?? "Meeting"} with{" "}
                          {b.contactId ? (
                            <Link
                              href={`/admin/contacts/${b.contactId}`}
                              className="hover:underline"
                            >
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
                      </div>
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/admin/bookings/${b.id}`}
                          className={buttonVariants({ variant: "outline", size: "sm" })}
                        >
                          Open briefing
                        </Link>
                        <form action={hostConfirm.bind(null, b.id)}>
                          <SubmitButton size="sm">Accept</SubmitButton>
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
                          aria-label="Your reply"
                          placeholder="Thanks for reaching out — here is the short answer…"
                          className="flex-1 rounded-lg border bg-background px-3 py-2 text-sm"
                        />
                        <SubmitButton variant="outline">Send &amp; withdraw request</SubmitButton>
                      </form>
                    </details>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card id="keep-moving" title="Keep things moving" more={{ href: "/admin/contacts" }}>
            {stale.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nobody is waiting on you.</p>
            ) : (
              <ul className="divide-y">
                {stale.slice(0, 6).map((c) => {
                  const dueNow = c.nextFollowUpAt && c.nextFollowUpAt <= now;
                  const name = c.name || c.email;
                  const days = Math.max(
                    1,
                    Math.round((now.getTime() - c.lastActivityAt.getTime()) / 86_400_000),
                  );
                  return (
                    <li key={c.id} className="py-1 first:pt-0 last:pb-0">
                      <ListRow
                        name={name}
                        href={`/admin/contacts/${c.id}`}
                        subtitle={
                          <span className="text-muted-foreground">
                            {dueNow ? "Follow-up due" : `${stageName(c)}, no reply`}
                            <span aria-hidden> • </span>
                            <span className="font-medium text-warning">
                              {dueNow
                                ? dayLabel(utcToZoned(c.nextFollowUpAt!, tz).date)
                                : `${days} days`}
                            </span>
                          </span>
                        }
                        actions={
                          <>
                            <Link
                              href={`/admin/contacts/${c.id}?compose=followup`}
                              className={buttonVariants({ variant: "outline", size: "sm" })}
                            >
                              Draft follow-up
                            </Link>
                            <KeepMovingMenu contactId={c.id} name={name} />
                          </>
                        }
                      />
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>

        <div className="min-w-0 space-y-6">
          <Card
            id="next-steps"
            title="Your next steps"
            more={taskBoard ? { href: "/admin/tasks?view=mine" } : undefined}
          >
            {steps.length === 0 ? (
              <p className="text-sm text-muted-foreground">No open tasks.</p>
            ) : (
              <NextSteps steps={steps} />
            )}
            <form action={addTaskAction} className="mt-3 flex flex-wrap gap-2 border-t pt-3">
              <input
                name="title"
                required
                aria-label="New task"
                placeholder="Add a task…"
                className="h-8 min-w-0 flex-1 rounded-lg border bg-background px-3 text-sm"
              />
              <DatePicker name="dueAt" ariaLabel="Due date" placeholder="Due" className="w-28" />
              <SubmitButton variant="outline" size="sm">
                Add
              </SubmitButton>
            </form>
          </Card>

          {threads && (
            <Card
              id="conversations"
              title="Recent conversations"
              more={{ href: "/admin/messages" }}
            >
              {threads.rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No conversations yet. Emails with clients and team threads land here.
                </p>
              ) : (
                <ul className="-mx-2">
                  {threads.rows.slice(0, 4).map((t) => (
                    <li key={t.id}>
                      <ListRow
                        name={t.title}
                        href={`/admin/messages?thread=${t.id}`}
                        preview={t.preview}
                        meta={ago(t.lastActivityAt)}
                        unread={t.unread}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          {recap && (
            <RecapCard
              title={`${ago(recap.booking.startAt) === "Yesterday" ? "Yesterday's" : "Your"} call with ${recap.booking.attendeeName.split(" ")[0]}`}
              meta={
                <>
                  {recap.recap.decisions.length} decision
                  {recap.recap.decisions.length === 1 ? "" : "s"}
                  <span aria-hidden> • </span>
                  {recap.recap.actions.length} action item
                  {recap.recap.actions.length === 1 ? "" : "s"}
                  {recaps.length > 1 && (
                    <>
                      <span aria-hidden> • </span>
                      {recaps.length - 1} more to review
                    </>
                  )}
                </>
              }
              action={
                <Button
                  nativeButton={false}
                  render={<Link href={`/admin/bookings/${recap.booking.id}`} />}
                >
                  Review recap
                  <ChevronRightIcon data-icon="inline-end" />
                </Button>
              }
            />
          )}

          {waitlist.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {waitlist.length} {waitlist.length === 1 ? "person is" : "people are"} on a waitlist.{" "}
              <Link href="/admin/bookings" className="underline underline-offset-4">
                See bookings
              </Link>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AdminHomeBoundary(props: PageProps<"/admin">) {
  return (
    <Suspense fallback={<HomeSkeleton />}>
      <AdminHome {...props} />
    </Suspense>
  );
}
