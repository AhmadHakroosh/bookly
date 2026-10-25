import { BookingsSkeleton } from "@/components/skeletons/pages";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { BetaBadge } from "@/components/beta-badge";
import { Button } from "@/components/ui/button";
import {
  BOOKINGS_VIEW_COOKIE,
  isCalendarView,
  isIsoDate,
  viewRange,
  type CalendarView,
} from "@/lib/calendar";
import { addDays, fmtTime, formatInTz, todayIn, utcToZoned, zonedToUtc } from "@/lib/time";
import {
  countRequests,
  decodeListCursor,
  legendOf,
  listBookingsPage,
  listBookingsRange,
  safeColor,
  type ViewBooking,
} from "@/server/bookings-view";
import { hasFlag, inBeta } from "@/server/flags";
import { listProfiles } from "@/server/scheduling";
import { isManager } from "@/server/session";
import { BookingDetail } from "./booking-detail";
import { BookingPane } from "./booking-pane";
import { BookingsCalendar, collapse } from "./calendar-view";
import { ViewToggle } from "./view-controls";
import Link from "next/link";
import { Suspense } from "react";
import { PaneHost } from "@/components/pane";
import { CalendarIcon, ClockIcon, UsersIcon } from "lucide-react";
import { cn } from "cn";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { initialsOf } from "@/components/ui/avatar-stack";
import { EmptyState } from "@/components/ui/empty-state";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { StatusChip, type StatusTone } from "@/components/ui/status-chip";
import { BookingRowMenu } from "./booking-row-menu";
import { SubmitButton } from "@/components/submit-button";
import { fmtDateTime } from "@/lib/time";
import { formatPrice } from "@/server/payments";
import { getProfileByUser, listBookings, locationLabel } from "@/server/scheduling";
import { groupSessions } from "@/server/sessions";
import { requireStaff } from "@/server/session";
import { listWaitlist } from "@/server/waitlist";
import { getCurrentWorkspace } from "@/server/workspace";
import { hostCancel, hostConfirm, hostMark, hostRemoveWaitlist } from "../scheduling-actions";
import { PageHeader } from "@/components/ui/page-header";

export const metadata = { title: "Bookings" };

type Row = Awaited<ReturnType<typeof listBookings>>[number] & {
  eventColor?: string | null;
  hostName?: string | null;
};
/** Where clicking a booking goes: its page, or the side pane (`?booking=<id>`). */
type OpenHref = (id: string) => string;
const toPage: OpenHref = (id) => `/admin/bookings/${id}`;

const STATUS_TONE: Record<string, StatusTone> = {
  pending: "warning",
  cancelled: "neutral",
  rescheduled: "neutral",
  no_show: "destructive",
  completed: "neutral",
};

/** A status worth saying: confirmed is the norm, so it has no chip. */
function Status({ status }: { status: string }) {
  if (status === "confirmed") return null;
  const label = status === "pending" ? "Request" : status.replace("_", " ");
  return (
    <StatusChip tone={STATUS_TONE[status] ?? "neutral"} className="capitalize">
      {label}
    </StatusChip>
  );
}

/** ⋯ for one booking, with the actions that fit its state. */
function RowMenu({ b, past, open: openHref }: { b: Row; past: boolean; open: OpenHref }) {
  const live = b.status !== "cancelled" && b.status !== "rescheduled";
  return (
    <BookingRowMenu
      label={`${b.eventTitle ?? "Meeting"} with ${b.attendeeName}`}
      openHref={live ? openHref(b.id) : toPage(b.id)}
      past={past}
      confirm={b.status === "pending" ? hostConfirm.bind(null, b.id) : undefined}
      noShow={
        past && (b.status === "confirmed" || b.status === "completed")
          ? hostMark.bind(null, b.id, "no_show")
          : undefined
      }
      undoNoShow={
        past && b.status === "no_show" ? hostMark.bind(null, b.id, "completed") : undefined
      }
      cancel={
        (b.status === "confirmed" || b.status === "pending") && b.endAt > new Date()
          ? hostCancel.bind(null, b.id)
          : undefined
      }
    />
  );
}

const durationOf = (b: Row) => Math.round((b.endAt.getTime() - b.startAt.getTime()) / 60_000);

/** A small dot in the event type's colour. */
function Swatch({ color }: { color?: string | null }) {
  return (
    <span
      aria-hidden
      className="inline-block size-2 shrink-0 rounded-full"
      style={{ background: safeColor(color) }}
    />
  );
}

function Initials({ name, group = false }: { name: string; group?: boolean }) {
  return (
    <Avatar size="lg" aria-hidden className="hidden sm:flex">
      <AvatarFallback>{group ? <UsersIcon className="size-4" /> : initialsOf(name)}</AvatarFallback>
    </Avatar>
  );
}

/** Payment, series and receipt facts for a booking, as small chips. */
function Facts({ b, series = true }: { b: Row; series?: boolean }) {
  return (
    <>
      {series && b.seriesCount && (
        <StatusChip tone="neutral">
          Session {b.seriesIndex} of {b.seriesCount}
        </StatusChip>
      )}
      {b.paymentStatus && b.amountCents != null && (
        <StatusChip tone={b.paymentStatus === "paid" ? "success" : "neutral"}>
          {formatPrice(b.amountCents, b.currency)}
          {b.paymentStatus === "refunded"
            ? " refunded"
            : b.paymentStatus === "paid"
              ? " paid"
              : " unpaid"}
        </StatusChip>
      )}
    </>
  );
}

type Waits = Awaited<ReturnType<typeof listWaitlist>>;

/**
 * The bookings as `ui mocks.png` 02 lists them: grouped by day ("Today · Sun, Oct 25"), each
 * row the time and length, the person and the event type, and ⋯. A row opens the booking (in
 * the side pane on the workspace page, `selected` while it is open). Group sessions are one
 * row with their seats and everyone in them; waitlists sit under their sessions.
 */
function BookingList({
  rows,
  waitlist,
  tz,
  past,
  today,
  open = toPage,
  selected = null,
  colors = false,
  showHost = false,
  more,
  empty,
}: {
  rows: Row[];
  waitlist: Waits;
  tz: string;
  past: boolean;
  today: string;
  open?: OpenHref;
  selected?: string | null;
  colors?: boolean;
  showHost?: boolean;
  /** "Show more" link for the next page, when there is one. */
  more?: string | null;
  empty: string;
}) {
  const groups = groupSessions(rows);
  // Waiting entries that belong to a specific group session are shown with that session.
  const sessionWaits = new Map<string, Waits>();
  for (const w of waitlist) {
    if (!w.startAt) continue;
    const key = `${w.eventTypeId}|${w.startAt.toISOString()}`;
    sessionWaits.set(key, [...(sessionWaits.get(key) ?? []), w]);
  }
  const shownWaits = new Set<string>();
  const dayOf = (d: Date) => utcToZoned(d, tz).date;
  const days: { date: string; groups: typeof groups }[] = [];
  for (const g of groups) {
    const first = g.kind === "single" ? g.booking : g.bookings[0]!;
    const d = dayOf(first.startAt);
    const last = days.at(-1);
    if (last?.date === d) last.groups.push(g);
    else days.push({ date: d, groups: [g] });
  }
  const dayTitle = (d: string) => {
    const label = formatInTz(zonedToUtc(d, 12 * 60, tz), tz, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    return d === today
      ? `Today · ${label}`
      : d === addDays(today, 1)
        ? `Tomorrow · ${label}`
        : d === addDays(today, -1)
          ? `Yesterday · ${label}`
          : label;
  };
  const time = (d: Date) => fmtTime(d, tz);
  const rowCls = (on: boolean) =>
    cn(
      "flex min-w-0 flex-1 items-center gap-3 rounded-lg px-3 py-2.5 outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
      on ? "bg-accent ring-1 ring-primary/40" : "hover:bg-muted/60",
    );
  return (
    <>
      {rows.length === 0 ? (
        <EmptyState size="sm" icon={CalendarIcon} title={empty} />
      ) : (
        <div className="space-y-5">
          {days.map((day) => (
            <section key={day.date} aria-label={dayTitle(day.date)}>
              <h2 className="mb-1.5 px-1 text-sm font-semibold text-muted-foreground">
                {dayTitle(day.date)}
              </h2>
              <ul className="divide-y rounded-xl border bg-card p-1.5">
                {day.groups.map((g) => {
                  if (g.kind === "single") {
                    const b = g.booking;
                    return (
                      <li key={b.id} className="flex items-center gap-1 py-0.5">
                        <Link
                          href={open(b.id)}
                          scroll={false}
                          className={rowCls(selected === b.id)}
                        >
                          <span className="w-[4.5rem] shrink-0 text-sm whitespace-nowrap sm:w-20">
                            <span className="block font-semibold tabular-nums">
                              {time(b.startAt)}
                            </span>
                            <span className="block text-xs text-muted-foreground">
                              {durationOf(b)} min
                            </span>
                          </span>
                          <Initials name={b.attendeeName} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold">
                              {b.attendeeName}
                            </span>
                            <span className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
                              {colors && <Swatch color={b.eventColor} />}
                              <span className="truncate">
                                {b.eventTitle ?? "Meeting"}
                                {b.contactCompany ? ` · ${b.contactCompany}` : ""}
                                {showHost && b.hostName ? ` · ${b.hostName}` : ""}
                              </span>
                            </span>
                          </span>
                          <span className="hidden shrink-0 flex-wrap items-center justify-end gap-1.5 sm:flex">
                            <Facts b={b} />
                            <Status status={b.status} />
                          </span>
                          <span className="sm:hidden">
                            <Status status={b.status} />
                          </span>
                        </Link>
                        <RowMenu b={b} past={past} open={open} />
                      </li>
                    );
                  }
                  const first = g.bookings[0]!;
                  const waits =
                    sessionWaits.get(`${first.eventTypeId}|${first.startAt.toISOString()}`) ?? [];
                  for (const w of waits) shownWaits.add(w.id);
                  return (
                    <li key={g.key} className="py-1">
                      <Link
                        href={open(first.id)}
                        scroll={false}
                        className={rowCls(g.bookings.some((b) => b.id === selected))}
                      >
                        <span className="w-[4.5rem] shrink-0 text-sm whitespace-nowrap sm:w-20">
                          <span className="block font-semibold tabular-nums">
                            {time(first.startAt)}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {durationOf(first)} min
                          </span>
                        </span>
                        <Initials name="" group />
                        <span className="min-w-0 flex-1">
                          <span className="flex min-w-0 items-center gap-1.5 text-sm font-semibold">
                            {colors && <Swatch color={first.eventColor} />}
                            <span className="truncate">{first.eventTitle ?? "Group session"}</span>
                          </span>
                          <span className="block truncate text-sm text-muted-foreground">
                            {first.seriesCount
                              ? `Session ${first.seriesIndex} of ${first.seriesCount} · `
                              : ""}
                            {first.meetingUrl ? "Video call" : locationLabel(first.location)}
                          </span>
                        </span>
                        <StatusChip tone={g.taken >= g.seats ? "accent" : "neutral"}>
                          <UsersIcon className="size-3" aria-hidden />
                          {g.taken} / {g.seats} seats
                        </StatusChip>
                      </Link>
                      <ul className="ms-[6.5rem] mt-1 space-y-0.5 border-s ps-3">
                        {g.bookings.map((b) => (
                          <li key={b.id} className="flex items-center gap-2 text-sm">
                            <Link
                              href={open(b.id)}
                              scroll={false}
                              className={cn(
                                "flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1 outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                                selected === b.id ? "bg-accent" : "hover:bg-muted/60",
                              )}
                            >
                              <span className="min-w-0 flex-1 truncate">
                                <span className="font-medium">{b.attendeeName}</span>
                                <span className="text-muted-foreground"> · {b.attendeeEmail}</span>
                              </span>
                              <Facts b={b} series={false} />
                              <Status status={b.status} />
                            </Link>
                            <RowMenu b={b} past={past} open={open} />
                          </li>
                        ))}
                      </ul>
                      {waits.length > 0 && (
                        <div className="ms-[6.5rem] mt-2 rounded-lg border border-dashed p-3">
                          <p className="inline-flex items-center gap-1.5 text-xs font-medium">
                            <ClockIcon className="size-3 text-muted-foreground" aria-hidden />
                            Waitlist: {waits.length} {waits.length === 1 ? "person" : "people"}
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            First in line is offered the seat if someone cancels.
                          </p>
                          <ul className="mt-2 space-y-1">
                            {waits.map((w, i) => (
                              <li
                                key={w.id}
                                className="flex flex-wrap items-center justify-between gap-2 text-xs"
                              >
                                <span>
                                  {i + 1}. {w.attendeeName}{" "}
                                  <span className="text-muted-foreground">· {w.attendeeEmail}</span>
                                </span>
                                <form action={hostRemoveWaitlist.bind(null, w.id)}>
                                  <SubmitButton variant="ghost" size="sm">
                                    Remove
                                  </SubmitButton>
                                </form>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
      {waitlist.some((w) => !shownWaits.has(w.id)) && (
        <section aria-labelledby="waitlist-title" className="rounded-xl border bg-card p-5">
          <h2 id="waitlist-title" className="text-lg font-semibold tracking-tight">
            Waitlist
          </h2>
          <p className="text-sm text-muted-foreground">
            People who asked to be told when a spot opens. They are emailed automatically on a
            cancellation.
          </p>
          <ul className="mt-3 divide-y">
            {waitlist
              .filter((w) => !shownWaits.has(w.id))
              .map((w) => (
                <li
                  key={w.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-sm"
                >
                  <div>
                    <p className="font-medium">
                      {w.attendeeName} · {w.eventTitle}
                    </p>
                    <p className="text-muted-foreground">
                      {w.startAt ? fmtDateTime(w.startAt, tz) : `Any time on ${w.date}`} ·{" "}
                      {w.attendeeEmail}
                    </p>
                  </div>
                  <form action={hostRemoveWaitlist.bind(null, w.id)}>
                    <SubmitButton variant="ghost">Remove</SubmitButton>
                  </form>
                </li>
              ))}
          </ul>
        </section>
      )}
      {more && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href={more} scroll={false} />}
          >
            Show more
          </Button>
        </div>
      )}
    </>
  );
}

/** The bookings page before the calendar (flag off): the list exactly as it was. */
async function LegacyBookings({ past }: { past: boolean }) {
  const [{ session, role }, ws] = await Promise.all([requireStaff(), getCurrentWorkspace()]);
  if (!ws) return null;
  const mine = role !== "owner" && role !== "admin";
  const [rows, profile, waitlist] = await Promise.all([
    listBookings(ws.id, {
      upcoming: !past,
      userId: mine ? session.user.id : undefined,
      viewer: session.user.id,
    }),
    getProfileByUser(ws.id, session.user.id),
    past ? Promise.resolve([]) : listWaitlist(ws.id, mine ? session.user.id : undefined),
  ]);
  const tz = profile?.timezone ?? ws.timezone;
  return (
    <div className="space-y-6">
      <PageHeader
        title="Bookings"
        description={<>Times shown in {tz}.</>}
        actions={
          <TimeTabs
            view={past ? "past" : "upcoming"}
            hrefs={{
              upcoming: "/admin/bookings",
              past: "/admin/bookings?view=past",
              requests: "/admin/bookings",
            }}
            requests={null}
          />
        }
      />
      <BookingList
        rows={rows}
        waitlist={waitlist}
        tz={tz}
        past={past}
        today={todayIn(tz)}
        empty={past ? "No past bookings." : "No upcoming bookings."}
      />
    </div>
  );
}

/** Upcoming · Past · Requests (n), as the concept's segmented tabs. */
function TimeTabs({
  view,
  hrefs,
  requests,
}: {
  view: "upcoming" | "past" | "requests";
  hrefs: Record<"upcoming" | "past" | "requests", string>;
  requests: number | null;
}) {
  return (
    <SegmentedTabs
      label="Which bookings"
      items={[
        { href: hrefs.upcoming, label: "Upcoming", active: view === "upcoming" },
        { href: hrefs.past, label: "Past", active: view === "past" },
        ...(requests !== null
          ? [
              {
                href: hrefs.requests,
                label: "Requests",
                count: requests,
                active: view === "requests",
              },
            ]
          : []),
      ]}
    />
  );
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

async function BookingsPage({ searchParams }: PageProps<"/admin/bookings">) {
  const [ws, sp, jar] = await Promise.all([getCurrentWorkspace(), searchParams, cookies()]);
  if (!ws) return null;
  // Bookings are about now: render per request (today, upcoming, the clock).
  await connection();
  const past = one(sp.view) === "past";
  if (!(await hasFlag(ws, "bookings_calendar"))) return <LegacyBookings past={past} />;
  return <BookingsWorkspace sp={sp} cookieMode={jar.get(BOOKINGS_VIEW_COOKIE)?.value} />;
}

/** List and calendar, the host filter, the legend and the side pane (flag on). */
async function BookingsWorkspace({
  sp,
  cookieMode,
}: {
  sp: Record<string, string | string[] | undefined>;
  cookieMode?: string;
}) {
  const [{ session, role }, ws] = await Promise.all([requireStaff(), getCurrentWorkspace()]);
  const viewer = session.user.id;
  if (!ws) return null;
  const manager = isManager(role);
  const profile = await getProfileByUser(ws.id, session.user.id);
  const tz = profile?.timezone ?? ws.timezone;
  const today = todayIn(tz);
  const mode: "list" | "calendar" =
    one(sp.mode) === "calendar" || one(sp.mode) === "list"
      ? (one(sp.mode) as "list" | "calendar")
      : cookieMode === "calendar"
        ? "calendar"
        : "list";
  const past = one(sp.view) === "past";
  const requestsView = one(sp.view) === "requests";
  const cal: CalendarView = isCalendarView(one(sp.cal)) ? (one(sp.cal) as CalendarView) : "week";
  const date = isIsoDate(one(sp.date)) ? one(sp.date)! : today;
  const profiles = manager ? await listProfiles(ws.id) : [];
  const hostParam = one(sp.host);
  // Members see their own bookings; owners and admins everyone's, or one host's.
  const hostUserId = manager
    ? profiles.some((p) => p.userId === hostParam)
      ? hostParam
      : undefined
    : session.user.id;
  const cursor = decodeListCursor(one(sp.after));

  const current: Record<string, string | null> = {
    mode,
    view: past ? "past" : requestsView ? "requests" : null,
    cal: mode === "calendar" ? cal : null,
    date: mode === "calendar" && date !== today ? date : null,
    host: manager && hostUserId ? hostUserId : null,
    after: mode === "list" && cursor ? one(sp.after)! : null,
    booking: one(sp.booking) ?? null,
  };
  const hrefFor = (patch: Record<string, string | null>) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...current, ...patch })) if (v) q.set(k, v);
    const s = q.toString();
    return `/admin/bookings${s ? `?${s}` : ""}`;
  };
  const open: OpenHref = (id) => hrefFor({ booking: id });

  let rows: ViewBooking[] = [];
  let next: string | null = null;
  let capped = false;
  let waitlist: Waits = [];
  if (mode === "calendar") {
    const range = viewRange(cal, date, tz);
    ({ rows, capped } = await listBookingsRange(ws.id, { ...range, hostUserId, viewer }));
  } else {
    [{ rows, next }, waitlist] = await Promise.all([
      listBookingsPage(ws.id, { past, hostUserId, cursor, viewer, pendingOnly: requestsView }),
      past || requestsView ? Promise.resolve([] as Waits) : listWaitlist(ws.id, hostUserId),
    ]);
  }
  const requests = await countRequests(ws.id, hostUserId);
  const legend = legendOf(rows);
  const bookingId = one(sp.booking);
  // Previous / next walk what is on screen: calendar blocks (a group session is one), list rows.
  const order = (mode === "calendar" ? collapse(rows) : rows).map((r) => r.id);
  const at = bookingId ? order.indexOf(bookingId) : -1;
  const paneBooking = bookingId ? (rows.find((r) => r.id === bookingId) ?? null) : null;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Bookings"
        badge={(await inBeta(ws, "bookings_calendar")) && <BetaBadge />}
        description={<>Times shown in {tz}.</>}
        actions={
          <ViewToggle
            mode={mode}
            listHref={hrefFor({ mode: "list", cal: null, date: null, booking: null })}
            calendarHref={hrefFor({
              mode: "calendar",
              view: null,
              after: null,
              booking: null,
              cal: cal,
            })}
          />
        }
      />

      {mode === "list" && (
        <TimeTabs
          view={past ? "past" : requestsView ? "requests" : "upcoming"}
          hrefs={{
            upcoming: hrefFor({ view: null, after: null, booking: null }),
            past: hrefFor({ view: "past", after: null, booking: null }),
            requests: hrefFor({ view: "requests", after: null, booking: null }),
          }}
          requests={requests}
        />
      )}

      {(manager && profiles.length > 1) || legend.length > 0 ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {manager && profiles.length > 1 && (
            <form method="get" action="/admin/bookings" className="flex items-center gap-2">
              {Object.entries(current)
                .filter(([k, v]) => v && k !== "host" && k !== "after" && k !== "booking")
                .map(([k, v]) => (
                  <input key={k} type="hidden" name={k} value={v!} />
                ))}
              <label className="text-sm text-muted-foreground" htmlFor="host-filter">
                Host
              </label>
              <select
                id="host-filter"
                name="host"
                defaultValue={hostUserId ?? ""}
                className="h-8 rounded-lg border bg-background pl-3 text-sm"
              >
                <option value="">Everyone</option>
                {profiles.map((p) => (
                  <option key={p.userId} value={p.userId}>
                    {p.displayName}
                  </option>
                ))}
              </select>
              <Button type="submit" variant="outline" size="sm">
                Show
              </Button>
            </form>
          )}
          {legend.length > 0 && (
            <ul
              aria-label="Event types"
              className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs"
            >
              {legend.map((l) => (
                <li
                  key={l.title}
                  className="inline-flex items-center gap-1.5 text-muted-foreground"
                >
                  <span
                    aria-hidden
                    className="inline-block size-2.5 rounded-full"
                    style={{ background: safeColor(l.color) }}
                  />
                  {l.title}
                  <span className="tabular-nums">{l.count}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {mode === "calendar" ? (
        <>
          <BookingsCalendar
            view={cal}
            date={date}
            rows={rows}
            tz={tz}
            today={today}
            hrefFor={hrefFor}
          />
          {capped && (
            <p className="text-xs text-muted-foreground">
              Showing the first {rows.length} bookings in this range; pick a shorter range or a host
              to see the rest.
            </p>
          )}
        </>
      ) : (
        <BookingList
          rows={rows}
          waitlist={waitlist}
          tz={tz}
          past={past}
          today={today}
          open={open}
          selected={bookingId ?? null}
          empty={
            requestsView
              ? "No requests waiting for you."
              : past
                ? "No past bookings."
                : "No upcoming bookings."
          }
          colors
          showHost={manager && !hostUserId}
          more={next ? hrefFor({ after: next, booking: null }) : null}
        />
      )}

      <PaneHost param="booking" id={bookingId ?? null} label="Booking">
        {bookingId && (
          <BookingPane
            title={
              paneBooking
                ? `${paneBooking.eventTitle ?? "Meeting"} with ${paneBooking.attendeeName}`
                : "Booking"
            }
            closeHref={hrefFor({ booking: null })}
            prevHref={at > 0 ? open(order[at - 1]!) : null}
            nextHref={at >= 0 && at < order.length - 1 ? open(order[at + 1]!) : null}
            fullHref={`/admin/bookings/${bookingId}`}
            position={at >= 0 ? `${at + 1} of ${order.length}` : null}
          >
            <BookingDetail id={bookingId} inPane />
          </BookingPane>
        )}
      </PaneHost>
    </div>
  );
}

export default function BookingsPageBoundary(props: PageProps<"/admin/bookings">) {
  return (
    <Suspense fallback={<BookingsSkeleton />}>
      <BookingsPage {...props} />
    </Suspense>
  );
}
