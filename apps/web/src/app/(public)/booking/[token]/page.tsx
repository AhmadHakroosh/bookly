import type { Metadata } from "next";
import { attendeeJoinUrl } from "@/lib/meet-link";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PublicContainer, PublicSkeleton } from "../../container";
import { eq, schema } from "@bookly/db";
import { db } from "@/lib/db";
import { formatPhone } from "@/lib/phone";
import { fmtDateTime } from "@/lib/time";
import { bookingSeries } from "@/server/booking-flow";
import { getBookingByToken, getProfileByUser, locationLabel } from "@/server/scheduling";
import { getCurrentWorkspace } from "@/server/workspace";
import { formatPrice } from "@/server/payments";
import { cancelByAttendee, cancelRemainingByAttendee, deleteMyTranscript, payNow } from "./actions";

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
  const skipped = Number(sp.skipped) || 0;
  const upcoming = b.endAt > new Date();
  const series = b.seriesId ? await bookingSeries(b) : [];
  const remaining = series.filter(
    (s) => s.endAt > new Date() && (s.status === "confirmed" || s.status === "pending"),
  );
  const title =
    b.status === "awaiting_payment"
      ? "Complete your payment"
      : b.status === "cancelled"
        ? "Booking cancelled"
        : b.status === "rescheduled"
          ? "Booking rescheduled"
          : b.status === "pending"
            ? "Request sent"
            : isNew
              ? "You're booked"
              : "Your booking";
  return (
    <PublicContainer className="py-12">
      <div className="mx-auto max-w-lg">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {b.status === "pending" && (
          <p className="mt-1 text-sm text-muted-foreground">
            {host?.displayName} will confirm shortly. You will get an email.
          </p>
        )}
        {isNew && skipped > 0 && (
          <p className="mt-2 rounded-lg bg-muted p-3 text-sm">
            {skipped} of the repeating dates {skipped === 1 ? "was" : "were"} skipped because{" "}
            {host?.displayName ?? "the host"} is busy then. The sessions below are booked.
          </p>
        )}
        {b.status === "awaiting_payment" && (
          <div className="mt-4 rounded-xl border p-4 text-sm">
            <p>
              {b.seriesCount ? "These sessions are" : "This slot is"} held for you for 30 minutes.
              Pay{" "}
              {b.amountCents != null
                ? formatPrice(b.amountCents * (b.seriesCount ?? 1), b.currency)
                : ""}{" "}
              to confirm {b.seriesCount ? `all ${b.seriesCount}` : "it"}.
            </p>
            <form action={payNow.bind(null, token)} className="mt-3">
              <button type="submit" className="rounded-lg bg-foreground px-4 py-2 text-background">
                Pay now
              </button>
            </form>
          </div>
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
                <a
                  href={attendeeJoinUrl(b) ?? b.meetingUrl}
                  className="underline underline-offset-4"
                >
                  {b.meetingUrl}
                </a>
              ) : (
                locationLabel(b.location)
              )}
            </dd>
          </div>
          {b.paymentStatus && (
            <div className="flex gap-4">
              <dt className="w-16 shrink-0 text-muted-foreground">Paid</dt>
              <dd>
                {b.amountCents != null ? formatPrice(b.amountCents, b.currency) : ""}
                {b.paymentStatus === "refunded"
                  ? " · refunded"
                  : b.paymentStatus === "pending"
                    ? " · payment pending"
                    : ""}
              </dd>
            </div>
          )}
          {b.seriesCount && (
            <div className="flex gap-4">
              <dt className="w-16 shrink-0 text-muted-foreground">Series</dt>
              <dd>
                Session {b.seriesIndex} of {b.seriesCount}
              </dd>
            </div>
          )}
          <div className="flex gap-4">
            <dt className="w-16 shrink-0 text-muted-foreground">Who</dt>
            <dd>
              {b.attendeeName} · {b.attendeeEmail}
              {b.attendeePhone ? ` · ${formatPhone(b.attendeePhone)}` : ""}
            </dd>
          </div>
        </dl>
        {(b.transcriptStatus === "recording" || b.transcriptStatus === "ready") && (
          <div className="mt-6 rounded-xl border p-4 text-sm">
            <p className="font-medium">This call is transcribed</p>
            <p className="mt-1 text-muted-foreground">
              {host?.displayName ?? "The host"} uses the transcript to prepare notes and action
              items
              {b.status === "completed" || b.endAt < new Date()
                ? ""
                : " once the call has taken place"}
              . You can have it deleted at any time; a short summary may be kept.
            </p>
            <form action={deleteMyTranscript.bind(null, token)} className="mt-2">
              <button type="submit" className="rounded-lg border px-3 py-1.5 text-sm">
                Delete the transcript
              </button>
            </form>
          </div>
        )}
        {b.transcriptStatus === "deleted" && (
          <p className="mt-6 text-sm text-muted-foreground">
            The transcript of this call was deleted.
          </p>
        )}
        {b.status !== "cancelled" &&
          b.status !== "rescheduled" &&
          b.status !== "awaiting_payment" && (
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
        {series.length > 1 && (
          <section className="mt-8">
            <h2 className="text-sm font-medium">All sessions in this series</h2>
            <ol className="mt-2 divide-y rounded-xl border text-sm">
              {series.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-2">
                  <span className={s.status === "cancelled" ? "line-through opacity-60" : ""}>
                    {s.seriesIndex}. {fmtDateTime(s.startAt, b.timezone)}
                  </span>
                  {s.id === b.id ? (
                    <span className="text-xs text-muted-foreground">this page</span>
                  ) : (
                    <Link href={`/booking/${s.manageToken}`} className="text-xs underline">
                      {s.status === "cancelled" ? "cancelled" : "manage"}
                    </Link>
                  )}
                </li>
              ))}
            </ol>
            {remaining.length > 1 && (
              <details className="mt-3 rounded-xl border p-4">
                <summary className="cursor-pointer text-sm font-medium">
                  Cancel all {remaining.length} remaining sessions
                </summary>
                <form
                  action={cancelRemainingByAttendee.bind(null, token)}
                  className="mt-3 space-y-2"
                >
                  <input
                    name="reason"
                    placeholder="Reason (optional)"
                    className="h-9 w-full rounded-lg border bg-background px-3 text-sm"
                  />
                  <button
                    type="submit"
                    className="rounded-lg border px-3 py-1.5 text-sm text-destructive"
                  >
                    Cancel remaining sessions
                  </button>
                </form>
              </details>
            )}
          </section>
        )}
      </div>
    </PublicContainer>
  );
}

export default function BookingPageBoundary(props: PageProps<"/booking/[token]">) {
  return (
    <Suspense fallback={<PublicSkeleton width="max-w-lg" />}>
      <BookingPage {...props} />
    </Suspense>
  );
}
