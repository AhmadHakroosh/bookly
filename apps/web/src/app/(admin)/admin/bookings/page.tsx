import Link from "next/link";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { SubmitButton } from "@/components/submit-button";
import { fmtDateTime } from "@/lib/time";
import { formatPrice } from "@/server/payments";
import { getProfileByUser, listBookings, locationLabel } from "@/server/scheduling";
import { requireStaff } from "@/server/session";
import { listWaitlist } from "@/server/waitlist";
import { getCurrentWorkspace } from "@/server/workspace";
import { hostCancel, hostConfirm, hostMark, hostRemoveWaitlist } from "../scheduling-actions";
import { PageSkeleton } from "@/components/page-skeleton";

export const metadata = { title: "Bookings" };

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
  // Group sessions: how many seats each (event type, start, host) session has taken.
  const taken = new Map<string, number>();
  const sessionKey = (b: (typeof rows)[number]) =>
    `${b.eventTypeId}|${b.hostUserId}|${b.startAt.toISOString()}`;
  for (const b of rows)
    if ((b.eventSeats ?? 1) > 1 && (b.status === "confirmed" || b.status === "pending"))
      taken.set(sessionKey(b), (taken.get(sessionKey(b)) ?? 0) + 1);
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
      <ul className="space-y-2">
        {rows.map((b) => (
          <li
            key={b.id}
            className="flex flex-wrap items-start justify-between gap-3 rounded-xl border p-4 text-sm"
          >
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
                {fmtDateTime(b.startAt, tz)} · {b.meetingUrl ?? locationLabel(b.location)}
              </p>
              <p className="text-xs text-muted-foreground">
                {b.attendeeEmail}
                {b.notes ? ` · “${b.notes}”` : ""}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {(b.eventSeats ?? 1) > 1 && (
                <Badge variant="outline">
                  {taken.get(sessionKey(b)) ?? 0}/{b.eventSeats} seats
                </Badge>
              )}
              {b.seriesCount && (
                <Badge variant="outline">
                  Series {b.seriesIndex}/{b.seriesCount}
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
              <Badge
                variant={b.status === "confirmed" ? "default" : "secondary"}
                className="capitalize"
              >
                {b.status.replace("_", " ")}
              </Badge>
              {b.status !== "cancelled" && b.status !== "rescheduled" && (
                <Link
                  href={`/admin/bookings/${b.id}`}
                  className="text-sm underline underline-offset-4"
                >
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
                    className="h-7 w-32 rounded-md border bg-background px-2 text-xs"
                  />
                  <SubmitButton variant="ghost">Cancel</SubmitButton>
                </form>
              )}
            </div>
          </li>
        ))}
        {rows.length === 0 && (
          <li className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">
            No {past ? "past" : "upcoming"} bookings.
          </li>
        )}
      </ul>
      {waitlist.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold tracking-tight">Waitlist</h2>
          <p className="text-sm text-muted-foreground">
            People who asked to be told when a spot opens. They are emailed automatically on a
            cancellation.
          </p>
          <ul className="mt-3 space-y-2">
            {waitlist.map((w) => (
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
