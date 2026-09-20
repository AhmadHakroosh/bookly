import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { eq, schema } from "@bookly/db";
import { db } from "@/lib/db";
import { fmtDateTime } from "@/lib/time";
import { getBookingByToken, getProfileByUser, locationLabel } from "@/server/scheduling";
import { getCurrentWorkspace } from "@/server/workspace";
import { cancelByAttendee } from "./actions";

export const metadata: Metadata = { title: "Your booking", robots: { index: false } };

async function BookingPage({ params, searchParams }: PageProps<"/booking/[token]">) {
  const [{ token }, sp] = await Promise.all([params, searchParams]);
  const ws = await getCurrentWorkspace();
  const b = await getBookingByToken(token);
  if (!ws || !b || b.workspaceId !== ws.id) notFound();
  const [host, et] = await Promise.all([
    getProfileByUser(ws.id, b.hostUserId),
    b.eventTypeId
      ? db().query.eventTypes.findFirst({ where: eq(schema.eventTypes.id, b.eventTypeId) })
      : null,
  ]);
  const isNew = sp.new === "1";
  const upcoming = b.endAt > new Date();
  const title =
    b.status === "cancelled"
      ? "Booking cancelled"
      : b.status === "rescheduled"
        ? "Booking rescheduled"
        : b.status === "pending"
          ? "Request sent"
          : isNew
            ? "You're booked"
            : "Your booking";
  return (
    <div className="mx-auto w-full max-w-lg px-4 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {b.status === "pending" && (
        <p className="mt-1 text-sm text-muted-foreground">
          {host?.displayName} will confirm shortly. You will get an email.
        </p>
      )}
      <dl className="mt-8 space-y-3 rounded-xl border p-5 text-sm">
        <div className="flex gap-4">
          <dt className="w-16 shrink-0 text-muted-foreground">What</dt>
          <dd>
            {et?.title ?? "Meeting"} with {host?.displayName}
          </dd>
        </div>
        <div className="flex gap-4">
          <dt className="w-16 shrink-0 text-muted-foreground">When</dt>
          <dd>{fmtDateTime(b.startAt, b.timezone)}</dd>
        </div>
        <div className="flex gap-4">
          <dt className="w-16 shrink-0 text-muted-foreground">Where</dt>
          <dd>
            {b.meetingUrl ? (
              <a href={b.meetingUrl} className="underline underline-offset-4">
                {b.meetingUrl}
              </a>
            ) : (
              locationLabel(b.location)
            )}
          </dd>
        </div>
        <div className="flex gap-4">
          <dt className="w-16 shrink-0 text-muted-foreground">Who</dt>
          <dd>
            {b.attendeeName} · {b.attendeeEmail}
          </dd>
        </div>
      </dl>
      {b.status !== "cancelled" && b.status !== "rescheduled" && (
        <div className="mt-6 flex flex-wrap gap-2">
          <a href={`/booking/${token}/ics`} className="rounded-lg border px-3 py-2 text-sm">
            Add to calendar (.ics)
          </a>
          {upcoming && host && et && (
            <Link
              href={`/${host.username}/${et.slug}?reschedule=${token}`}
              className="rounded-lg border px-3 py-2 text-sm"
            >
              Reschedule
            </Link>
          )}
        </div>
      )}
      {b.status !== "cancelled" && b.status !== "rescheduled" && upcoming && (
        <details className="mt-8 rounded-xl border p-4">
          <summary className="cursor-pointer text-sm font-medium">Cancel this booking</summary>
          <form action={cancelByAttendee.bind(null, token)} className="mt-3 space-y-2">
            <input
              name="reason"
              placeholder="Reason (optional)"
              className="h-9 w-full rounded-lg border bg-background px-3 text-sm"
            />
            <button
              type="submit"
              className="rounded-lg border px-3 py-1.5 text-sm text-destructive"
            >
              Cancel booking
            </button>
          </form>
        </details>
      )}
      {b.status === "cancelled" && b.cancelReason && (
        <p className="mt-4 text-sm text-muted-foreground">Reason: {b.cancelReason}</p>
      )}
    </div>
  );
}

export default function BookingPageBoundary(props: PageProps<"/booking/[token]">) {
  return (
    <Suspense fallback={null}>
      <BookingPage {...props} />
    </Suspense>
  );
}
