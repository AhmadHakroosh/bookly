import { BookingBriefSkeleton, BookingsSkeleton } from "@/components/skeletons/pages";
import { cookies } from "next/headers";
import { BetaBadge } from "@/components/beta-badge";
import { Button } from "@/components/ui/button";
import {
  BOOKINGS_VIEW_COOKIE,
  isCalendarView,
  isIsoDate,
  viewRange,
  type CalendarView,
} from "@/lib/calendar";
import { todayIn } from "@/lib/time";
import {
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
import { CheckIcon, ClockIcon, UsersIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SubmitButton } from "@/components/submit-button";
import { fmtDateTime } from "@/lib/time";
import { formatPrice } from "@/server/payments";
import { getProfileByUser, listBookings, locationLabel } from "@/server/scheduling";
import { groupSessions } from "@/server/sessions";
import { requireStaff } from "@/server/session";
import { listWaitlist } from "@/server/waitlist";
import { getCurrentWorkspace } from "@/server/workspace";
import { hostCancel, hostConfirm, hostMark, hostRemoveWaitlist } from "../scheduling-actions";

export const metadata = { title: "Bookings" };

type Row = Awaited<ReturnType<typeof listBookings>>[number] & {
  eventColor?: string | null;
  hostName?: string | null;
};
/** Where clicking a booking goes: its page, or the side pane (`?booking=<id>`). */
type OpenHref = (id: string) => string;
const toPage: OpenHref = (id) => `/admin/bookings/${id}`;

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={status === "confirmed" ? "default" : "secondary"} className="capitalize">
      {status.replace("_", " ")}
    </Badge>
  );
}

/** The actions a host can take on one booking; used on single rows and on each seat. */
function Actions({ b, past, open: openHref }: { b: Row; past: boolean; open: OpenHref }) {
  const open = b.status !== "cancelled" && b.status !== "rescheduled";
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {open && (
        <Link href={openHref(b.id)} scroll={false} className="text-sm underline underline-offset-4">
          {past ? "Notes" : "Brief"}
        </Link>
      )}
      {b.status === "pending" && (
        <form action={hostConfirm.bind(null, b.id)}>
          <SubmitButton>Confirm</SubmitButton>
        </form>
      )}
      {past && (b.status === "confirmed" || b.status === "completed") && (
        <form action={hostMark.bind(null, b.id, "no_show")}>
          <SubmitButton variant="ghost">No-show</SubmitButton>
        </form>
      )}
      {past && b.status === "no_show" && (
        <form action={hostMark.bind(null, b.id, "completed")}>
          <SubmitButton variant="ghost">Undo no-show</SubmitButton>
        </form>
      )}
      {(b.status === "confirmed" || b.status === "pending") && b.endAt > new Date() && (
        <form action={hostCancel.bind(null, b.id)} className="flex gap-1">
          <input
            name="reason"
            placeholder="Reason"
            aria-label="Cancellation reason"
            className="w-32 rounded-lg border bg-background px-3 text-sm"
          />
          <SubmitButton variant="ghost">Cancel</SubmitButton>
        </form>
      )}
    </div>
  );
}

function Attendee({ b }: { b: Row }) {
  return (
    <span className="min-w-0">
      {b.contactId ? (
        <Link href={`/admin/contacts/${b.contactId}`} className="font-medium hover:underline">
          {b.attendeeName}
        </Link>
      ) : (
        <span className="font-medium">{b.attendeeName}</span>
      )}
      {b.contactCompany && <span className="text-muted-foreground"> · {b.contactCompany}</span>}
      <span className="block truncate text-xs text-muted-foreground">
        {b.attendeeEmail}
        {b.notes ? ` · “${b.notes}”` : ""}
      </span>
      {b.guests.length > 0 && (
        <span className="block truncate text-xs text-muted-foreground">
          With {b.guests.join(", ")}
        </span>
      )}
    </span>
  );
}

const durationOf = (b: Row) => Math.round((b.endAt.getTime() - b.startAt.getTime()) / 60_000);

/** A small dot in the event type's colour, before the title. */
function Swatch({ color }: { color?: string | null }) {
  return (
    <span
      aria-hidden
      className="mr-1.5 inline-block size-2.5 rounded-full align-middle"
      style={{ background: safeColor(color) }}
    />
  );
}

type Waits = Awaited<ReturnType<typeof listWaitlist>>;

/** The bookings as a list: singles and group sessions, with waitlists under their sessions. */
function BookingList({
  rows,
  waitlist,
  tz,
  past,
  open = toPage,
  pane = false,
  colors = false,
  showHost = false,
  more,
}: {
  rows: Row[];
  waitlist: Waits;
  tz: string;
  past: boolean;
  open?: OpenHref;
  pane?: boolean;
  colors?: boolean;
  showHost?: boolean;
  /** "Show more" link for the next page, when there is one. */
  more?: string | null;
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
  return (
    <>
      <ul className="space-y-3">
        {groups.map((g) => {
          if (g.kind === "single") {
            const b = g.booking;
            return (
              <li key={b.id} className="rounded-xl border p-4 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {colors && <Swatch color={b.eventColor} />}
                      {pane ? (
                        <Link href={open(b.id)} scroll={false} className="hover:underline">
                          {b.eventTitle ?? "Meeting"} with {b.attendeeName}
                        </Link>
                      ) : (
                        <>
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
                        </>
                      )}
                    </p>
                    <p className="text-muted-foreground">
                      {fmtDateTime(b.startAt, tz)} · {b.meetingUrl ?? locationLabel(b.location)}
                      {showHost && b.hostName ? ` · ${b.hostName}` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {b.attendeeEmail}
                      {b.notes ? ` · “${b.notes}”` : ""}
                    </p>
                    {b.guests.length > 0 && (
                      <p className="text-xs text-muted-foreground">With {b.guests.join(", ")}</p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {b.seriesCount && (
                      <Badge variant="outline">
                        Session {b.seriesIndex} of {b.seriesCount}
                      </Badge>
                    )}
                    {b.paymentStatus && b.amountCents != null && (
                      <Badge variant="outline">
                        {formatPrice(b.amountCents, b.currency)}
                        {b.paymentStatus === "refunded"
                          ? " refunded"
                          : b.paymentStatus === "paid"
                            ? " paid"
                            : " unpaid"}
                      </Badge>
                    )}
                    {(b.paymentStatus === "paid" || b.paymentStatus === "refunded") && (
                      <Link
                        href={`/booking/${b.manageToken}/receipt`}
                        className="text-xs underline underline-offset-4"
                      >
                        Receipt
                      </Link>
                    )}
                    {b.paymentRef?.receiptUrl && (
                      <a
                        href={b.paymentRef.receiptUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs underline underline-offset-4"
                      >
                        Stripe receipt
                      </a>
                    )}
                    <StatusBadge status={b.status} />
                  </div>
                </div>
                <div className="mt-3">
                  <Actions b={b} past={past} open={open} />
                </div>
              </li>
            );
          }
          const first = g.bookings[0]!;
          const waits =
            sessionWaits.get(`${first.eventTypeId}|${first.startAt.toISOString()}`) ?? [];
          for (const w of waits) shownWaits.add(w.id);
          return (
            <li key={g.key} className="rounded-xl border p-4 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">
                    {colors && <Swatch color={first.eventColor} />}
                    {first.eventTitle ?? "Group session"} · {fmtDateTime(first.startAt, tz)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {first.seriesCount
                      ? `Session ${first.seriesIndex} of ${first.seriesCount} · `
                      : ""}
                    {durationOf(first)} min · {first.meetingUrl ?? locationLabel(first.location)}
                  </p>
                </div>
                <Badge className="shrink-0">
                  <UsersIcon className="mr-1 size-3" aria-hidden />
                  {g.taken} / {g.seats} seats
                </Badge>
              </div>
              <ul className="mt-3 divide-y rounded-lg border">
                {g.bookings.map((b) => (
                  <li key={b.id} className="space-y-2 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Attendee b={b} />
                      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                        {b.paymentStatus && b.amountCents != null && (
                          <span>
                            {formatPrice(b.amountCents, b.currency)}
                            {b.paymentStatus === "refunded"
                              ? " refunded"
                              : b.paymentStatus === "paid"
                                ? " paid"
                                : " unpaid"}
                            {(b.paymentStatus === "paid" || b.paymentStatus === "refunded") && (
                              <>
                                {" · "}
                                <Link
                                  href={`/booking/${b.manageToken}/receipt`}
                                  className="underline underline-offset-4"
                                >
                                  Receipt
                                </Link>
                                {b.paymentRef?.receiptUrl && (
                                  <>
                                    {" · "}
                                    <a
                                      href={b.paymentRef.receiptUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="underline underline-offset-4"
                                    >
                                      Stripe
                                    </a>
                                  </>
                                )}
                              </>
                            )}{" "}
                            ·
                          </span>
                        )}
                        {b.status === "confirmed" && <CheckIcon className="size-3" aria-hidden />}
                        <span className="capitalize">{b.status.replace("_", " ")}</span>
                      </span>
                    </div>
                    <Actions b={b} past={past} open={open} />
                  </li>
                ))}
              </ul>
              {waits.length > 0 && (
                <div className="mt-3 rounded-lg border border-dashed p-3">
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
                          <SubmitButton variant="ghost">Remove</SubmitButton>
                        </form>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </li>
          );
        })}
        {rows.length === 0 && (
          <li className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">
            No {past ? "past" : "upcoming"} bookings.
          </li>
        )}
      </ul>
      {waitlist.some((w) => !shownWaits.has(w.id)) && (
        <section>
          <h2 className="text-lg font-semibold tracking-tight">Waitlist</h2>
          <p className="text-sm text-muted-foreground">
            People who asked to be told when a spot opens. They are emailed automatically on a
            cancellation.
          </p>
          <ul className="mt-3 space-y-2">
            {waitlist
              .filter((w) => !shownWaits.has(w.id))
              .map((w) => (
                <li
                  key={w.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4 text-sm"
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
    listBookings(ws.id, { upcoming: !past, userId: mine ? session.user.id : undefined }),
    getProfileByUser(ws.id, session.user.id),
    past ? Promise.resolve([]) : listWaitlist(ws.id, mine ? session.user.id : undefined),
  ]);
  const tz = profile?.timezone ?? ws.timezone;
  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Bookings</h1>
          <p className="text-sm text-muted-foreground">Times shown in {tz}.</p>
        </div>
        <TimeTabs past={past} upcomingHref="/admin/bookings" pastHref="/admin/bookings?view=past" />
      </div>
      <BookingList rows={rows} waitlist={waitlist} tz={tz} past={past} />
    </div>
  );
}

function TimeTabs({
  past,
  upcomingHref,
  pastHref,
}: {
  past: boolean;
  upcomingHref: string;
  pastHref: string;
}) {
  return (
    <nav className="flex gap-2 text-sm" aria-label="Upcoming or past">
      <Link
        href={upcomingHref}
        aria-current={!past ? "page" : undefined}
        className={`rounded-md px-2.5 py-1 ${!past ? "bg-muted font-medium" : "text-muted-foreground"}`}
      >
        Upcoming
      </Link>
      <Link
        href={pastHref}
        aria-current={past ? "page" : undefined}
        className={`rounded-md px-2.5 py-1 ${past ? "bg-muted font-medium" : "text-muted-foreground"}`}
      >
        Past
      </Link>
    </nav>
  );
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

async function BookingsPage({ searchParams }: PageProps<"/admin/bookings">) {
  const [ws, sp, jar] = await Promise.all([getCurrentWorkspace(), searchParams, cookies()]);
  if (!ws) return null;
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
    view: past ? "past" : null,
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
    ({ rows, capped } = await listBookingsRange(ws.id, { ...range, hostUserId }));
  } else {
    [{ rows, next }, waitlist] = await Promise.all([
      listBookingsPage(ws.id, { past, hostUserId, cursor }),
      past ? Promise.resolve([] as Waits) : listWaitlist(ws.id, hostUserId),
    ]);
  }
  const legend = legendOf(rows);
  const bookingId = one(sp.booking);
  // Previous / next walk what is on screen: calendar blocks (a group session is one), list rows.
  const order = (mode === "calendar" ? collapse(rows) : rows).map((r) => r.id);
  const at = bookingId ? order.indexOf(bookingId) : -1;
  const paneBooking = bookingId ? (rows.find((r) => r.id === bookingId) ?? null) : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            Bookings
            {(await inBeta(ws, "bookings_calendar")) && <BetaBadge />}
          </h1>
          <p className="text-sm text-muted-foreground">Times shown in {tz}.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {mode === "list" && (
            <TimeTabs
              past={past}
              upcomingHref={hrefFor({ view: null, after: null, booking: null })}
              pastHref={hrefFor({ view: "past", after: null, booking: null })}
            />
          )}
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
        </div>
      </div>

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
          open={open}
          pane
          colors
          showHost={manager && !hostUserId}
          more={next ? hrefFor({ after: next, booking: null }) : null}
        />
      )}

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
          <Suspense fallback={<BookingBriefSkeleton />}>
            <BookingDetail id={bookingId} inPane />
          </Suspense>
        </BookingPane>
      )}
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
