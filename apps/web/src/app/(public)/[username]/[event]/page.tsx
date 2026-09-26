import type { Metadata } from "next";
import Link from "next/link";
import { BackLink } from "@/components/links";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PublicContainer, PublicSkeleton } from "../../container";
import { Skeleton } from "@/components/ui/skeleton";
import { MonthCalendar } from "@/components/booking/month-calendar";
import { TzDetect } from "@/components/booking/tz-detect";
import { TzPicker } from "@/components/booking/tz-picker";
import {
  addDays,
  canonicalTimezone,
  fmtDateTime,
  fmtTime,
  timezoneList,
  todayIn,
} from "@/lib/time";
import { planSeries } from "@/server/booking-flow";
import { describeRecurrence, recurrenceOf } from "@/server/recurrence";
import {
  locationsLabel,
  eventLocations,
  availableSlots,
  getBookingByToken,
  getEventType,
  getProfileByUsername,
  locationLabel,
  slotSeats,
} from "@/server/scheduling";
import { detectCountry } from "@/server/geo";
import { captureSupportsLocation } from "@/server/integrations/notetaker";
import { formatPrice, paymentsReady } from "@/server/payments";
import { getCurrentWorkspace } from "@/server/workspace";
import { publicBaseUrl } from "@/server/urls";
import { hasFeature } from "@/server/limits";
import { priorityForEmail } from "@/server/contacts";
import { fullSessions } from "@/server/waitlist";
import { waitingCounts } from "@/server/sessions";
import { Badge } from "@/components/ui/badge";
import { SlotChip } from "@/components/booking/slot-chip";
import { BookingForm } from "./booking-form";
import { WaitlistForm } from "./waitlist-form";

export async function generateMetadata({
  params,
}: PageProps<"/[username]/[event]">): Promise<Metadata> {
  const { username, event } = await params;
  const ws = await getCurrentWorkspace();
  const p = ws ? await getProfileByUsername(ws.id, username) : null;
  const et = ws && p ? await getEventType(ws.id, p.userId, event) : null;
  if (!ws || !p || !et) return {};
  const url = `${await publicBaseUrl(ws)}/${p.username}/${et.slug}`;
  const title = `${et.title} · ${p.displayName}`;
  const description = et.description ?? `Book ${et.title} with ${p.displayName}.`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { type: "website", url, title, description },
  };
}

async function EventPage({ params, searchParams }: PageProps<"/[username]/[event]">) {
  const [{ username, event }, sp] = await Promise.all([params, searchParams]);
  const ws = await getCurrentWorkspace();
  const profile = ws ? await getProfileByUsername(ws.id, username) : null;
  const et = ws && profile ? await getEventType(ws.id, profile.userId, event) : null;
  if (!ws || !profile || !et) notFound();

  const paid = paymentsReady(ws);
  const video = { video: hasFeature(ws, "booklyVideo") };
  const country = await detectCountry();
  const tzParam = typeof sp.tz === "string" ? canonicalTimezone(sp.tz) : null;
  const tz = tzParam ?? profile.timezone;
  const today = todayIn(tz);
  const month =
    typeof sp.month === "string" && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : today.slice(0, 7);
  const date =
    typeof sp.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : undefined;
  const slot = typeof sp.slot === "string" ? new Date(sp.slot) : null;
  const reschedule = typeof sp.reschedule === "string" ? sp.reschedule : undefined;
  const prev = reschedule ? await getBookingByToken(reschedule) : null;

  const monthStart = `${month}-01`;
  const monthEnd = addDays(
    `${month.split("-")[0]}-${String(Number(month.split("-")[1]) + 1).padStart(2, "0")}-01`.replace(
      /-13-01$/,
      "-12-31",
    ),
    Number(month.split("-")[1]) === 12 ? 0 : -1,
  );
  const knownEmail = typeof sp.email === "string" ? sp.email : prev?.attendeeEmail;
  const priority = await priorityForEmail(ws.id, knownEmail);
  const days = await availableSlots(et, tz, monthStart, monthEnd, { priority });
  const availableDates = new Set(days.map((d) => d.date));
  const daySlots = date ? (days.find((d) => d.date === date)?.slots ?? []) : [];
  const seats = await slotSeats(et, daySlots);
  const full = date ? await fullSessions(et, tz, date) : [];
  const waiting = await waitingCounts(et.id, full);
  const waitlist = et.waitlistEnabled && typeof sp.waitlist === "string" ? sp.waitlist : undefined;
  const rule = prev ? null : recurrenceOf(et.recurrence);
  const plan =
    slot && !Number.isNaN(slot.getTime()) && rule ? await planSeries(et, tz, slot, priority) : null;
  const bookable = plan?.filter((p) => p.hostUserId).length ?? 1;
  const base = `/${profile.username}/${et.slug}`;
  const makeHref = (over: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    const merged = {
      tz: tzParam ?? undefined,
      month,
      date,
      reschedule,
      name: typeof sp.name === "string" ? sp.name : undefined,
      email: typeof sp.email === "string" ? sp.email : undefined,
      ...over,
    } as Record<string, string | undefined>;
    for (const [k, v] of Object.entries(merged)) if (v) q.set(k, v);
    const s = q.toString();
    return s ? `${base}?${s}` : base;
  };

  return (
    <PublicContainer>
      <Suspense fallback={null}>
        <TzDetect />
      </Suspense>
      <div className="grid gap-8 rounded-2xl border md:grid-cols-[260px_1fr]">
        <aside className="border-b p-6 md:border-r md:border-b-0">
          <BackLink href={`/${profile.username}`}>{profile.displayName}</BackLink>
          <div className="mt-3 flex items-start justify-between gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{et.title}</h1>
            {rule && (
              <Badge variant="outline" className="mt-1 shrink-0">
                {rule.count} sessions
              </Badge>
            )}
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {et.durationMin} min · {locationsLabel(eventLocations(et, video))}
            {et.priceCents && paid ? ` · ${formatPrice(et.priceCents, et.currency)}` : ""}
            {et.seats > 1 ? ` · Group of up to ${et.seats}` : ""}
          </p>
          {rule && (
            <p className="mt-2 rounded-md bg-muted/60 px-2.5 py-1.5 text-xs text-muted-foreground">
              {describeRecurrence(rule)}. One booking reserves the whole series
              {et.priceCents && paid
                ? ` (${formatPrice(et.priceCents * rule.count, et.currency)} for ${rule.count} sessions)`
                : ""}
              .
            </p>
          )}
          {et.description && (
            <p className="mt-3 text-sm whitespace-pre-line text-muted-foreground">
              {et.description}
            </p>
          )}
          {prev && prev.status !== "cancelled" && (
            <p className="mt-4 rounded-lg bg-muted p-3 text-xs">
              Rescheduling your {fmtDateTime(prev.startAt, tz)} booking. Pick a new time.
            </p>
          )}
          {slot && !Number.isNaN(slot.getTime()) && (
            <div className="mt-4 rounded-lg border p-3 text-sm">
              <p className="font-medium">{fmtDateTime(slot, tz)}</p>
              {plan && (
                <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {plan.map((p, i) => (
                    <li key={p.start.toISOString()} className={p.hostUserId ? "" : "line-through"}>
                      {i + 1}. {fmtDateTime(p.start, tz)}
                      {p.hostUserId ? "" : " (host busy, skipped)"}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <div className="mt-4">
            <Suspense fallback={<Skeleton className="h-9 w-full rounded-lg" />}>
              <TzPicker value={tz} zones={timezoneList()} />
            </Suspense>
          </div>
        </aside>

        <section className="p-6">
          {waitlist ? (
            <div className="max-w-md">
              <BackLink href={makeHref({ waitlist: undefined })}>Back to times</BackLink>
              <h2 className="mt-3 mb-1 text-lg font-semibold">Join the waitlist</h2>
              <p className="mb-4 text-sm text-muted-foreground">
                {/^\d{4}-\d{2}-\d{2}$/.test(waitlist)
                  ? `We'll email you if a time on ${waitlist} frees up.`
                  : `We'll email you if a seat frees up for ${fmtDateTime(new Date(waitlist), tz)}.`}
              </p>
              <WaitlistForm username={profile.username} event={et.slug} target={waitlist} tz={tz} />
            </div>
          ) : slot && !Number.isNaN(slot.getTime()) ? (
            <div className="max-w-md">
              <BackLink href={makeHref({ slot: undefined })}>Pick another time</BackLink>
              <h2 className="mt-3 mb-4 text-lg font-semibold">Your details</h2>
              <BookingForm
                username={profile.username}
                event={et.slug}
                slot={slot.toISOString()}
                tz={tz}
                questions={et.questions}
                reschedule={reschedule}
                paid={!!et.priceCents && paid}
                sessions={plan ? bookable : 1}
                locations={eventLocations(et, video).map((l) => ({
                  type: l.type,
                  label: locationLabel(l),
                  capture: et.autoCapture === "ask" && captureSupportsLocation(l.type),
                  captureAlways: et.autoCapture === "always" && captureSupportsLocation(l.type),
                  ask:
                    l.type === "phone"
                      ? "phone"
                      : l.type === "in_person" && !l.value
                        ? "address"
                        : null,
                  note: l.type === "phone" ? l.value : undefined,
                }))}
                defaultLocation={prev?.location.type}
                defaultCountry={country}
                defaultPhone={prev?.attendeePhone}
                defaults={
                  prev
                    ? { name: prev.attendeeName, email: prev.attendeeEmail }
                    : {
                        name: typeof sp.name === "string" ? sp.name.slice(0, 120) : undefined,
                        email: typeof sp.email === "string" ? sp.email.slice(0, 200) : undefined,
                      }
                }
              />
            </div>
          ) : (
            <div className="space-y-6">
              <div className="max-w-sm">
                <MonthCalendar
                  month={month}
                  availableDates={availableDates}
                  selected={date}
                  today={today}
                  makeHref={makeHref}
                />
              </div>
              <div>
                <p className="mb-2 text-sm font-medium">
                  {date
                    ? new Date(`${date}T12:00:00Z`).toLocaleDateString("en", {
                        weekday: "long",
                        month: "short",
                        day: "numeric",
                        timeZone: "UTC",
                      })
                    : "Pick a day"}
                </p>
                <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
                  {[
                    ...daySlots.map((s) => ({ s, full: false })),
                    ...full.map((s) => ({ s, full: true })),
                  ]
                    .sort((a, b) => a.s.getTime() - b.s.getTime())
                    .map(({ s, full: isFull }) => {
                      if (isFull) {
                        const n = waiting.get(s.getTime()) ?? 0;
                        return (
                          <li key={`full-${s.toISOString()}`}>
                            <SlotChip
                              href={
                                et.waitlistEnabled
                                  ? makeHref({ waitlist: s.toISOString() })
                                  : undefined
                              }
                              time={fmtTime(s, tz)}
                              note={
                                !et.waitlistEnabled
                                  ? "Full"
                                  : n
                                    ? `Full · ${n} waiting`
                                    : "Full · waitlist"
                              }
                              full
                            />
                          </li>
                        );
                      }
                      const left = seats.get(s.getTime());
                      return (
                        <li key={s.toISOString()}>
                          <SlotChip
                            href={makeHref({ slot: s.toISOString() })}
                            time={fmtTime(s, tz)}
                            note={
                              et.seats > 1 && left != null
                                ? `${left} ${left === 1 ? "seat" : "seats"} left`
                                : undefined
                            }
                          />
                        </li>
                      );
                    })}
                </ul>
                {date && daySlots.length === 0 && full.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No times left this day.
                    {et.waitlistEnabled && (
                      <>
                        {" "}
                        <Link href={makeHref({ waitlist: date })} className="underline">
                          Join the waitlist
                        </Link>
                      </>
                    )}
                  </p>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </PublicContainer>
  );
}

export default function EventPageBoundary(props: PageProps<"/[username]/[event]">) {
  return (
    <Suspense fallback={<PublicSkeleton />}>
      <EventPage {...props} />
    </Suspense>
  );
}
