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
import { PageSkeleton } from "@/components/page-skeleton";

export const metadata = { title: "Bookings" };

type Row = Awaited<ReturnType<typeof listBookings>>[number];

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={status === "confirmed" ? "default" : "secondary"} className="capitalize">
      {status.replace("_", " ")}
    </Badge>
  );
}

/** The actions a host can take on one booking; used on single rows and on each seat. */
function Actions({ b, past }: { b: Row; past: boolean }) {
  const open = b.status !== "cancelled" && b.status !== "rescheduled";
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {open && (
        <Link href={`/admin/bookings/${b.id}`} className="text-sm underline underline-offset-4">
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
            className="h-7 w-28 rounded-md border bg-background px-2 text-xs"
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

async function BookingsPage({ searchParams }: PageProps<"/admin/bookings">) {
  const [{ session, role }, ws, sp] = await Promise.all([
    requireStaff(),
    getCurrentWorkspace(),
    searchParams,
  ]);
  if (!ws) return null;
  const past = sp.view === "past";
  const mine = role !== "owner" && role !== "admin";
  const [rows, profile, waitlist] = await Promise.all([
    listBookings(ws.id, { upcoming: !past, userId: mine ? session.user.id : undefined }),
    getProfileByUser(ws.id, session.user.id),
    past ? Promise.resolve([]) : listWaitlist(ws.id, mine ? session.user.id : undefined),
  ]);
  const tz = profile?.timezone ?? ws.timezone;
  const groups = groupSessions(rows);
  // Waiting entries that belong to a specific group session are shown with that session.
  const sessionWaits = new Map<string, typeof waitlist>();
  for (const w of waitlist) {
    if (!w.startAt) continue;
    const key = `${w.eventTypeId}|${w.startAt.toISOString()}`;
    sessionWaits.set(key, [...(sessionWaits.get(key) ?? []), w]);
  }
  const shownWaits = new Set<string>();
  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Bookings</h1>
          <p className="text-sm text-muted-foreground">Times shown in {tz}.</p>
        </div>
        <nav className="flex gap-2 text-sm">
          <Link
            href="/admin/bookings"
            className={`rounded-md px-2.5 py-1 ${!past ? "bg-muted font-medium" : "text-muted-foreground"}`}
          >
            Upcoming
          </Link>
          <Link
            href="/admin/bookings?view=past"
            className={`rounded-md px-2.5 py-1 ${past ? "bg-muted font-medium" : "text-muted-foreground"}`}
          >
            Past
          </Link>
        </nav>
      </div>
      <ul className="space-y-3">
        {groups.map((g) => {
          if (g.kind === "single") {
            const b = g.booking;
            return (
              <li key={b.id} className="rounded-xl border p-4 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
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
                      {fmtDateTime(b.startAt, tz)} · {b.meetingUrl ?? locationLabel(b.location)}
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
                    <StatusBadge status={b.status} />
                  </div>
                </div>
                <div className="mt-3">
                  <Actions b={b} past={past} />
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
                                : " unpaid"}{" "}
                            ·
                          </span>
                        )}
                        {b.status === "confirmed" && <CheckIcon className="size-3" aria-hidden />}
                        <span className="capitalize">{b.status.replace("_", " ")}</span>
                      </span>
                    </div>
                    <Actions b={b} past={past} />
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
    </div>
  );
}

export default function BookingsPageBoundary(props: PageProps<"/admin/bookings">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <BookingsPage {...props} />
    </Suspense>
  );
}
