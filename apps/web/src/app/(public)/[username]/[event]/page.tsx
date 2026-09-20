import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { MonthCalendar } from "@/components/booking/month-calendar";
import { TzDetect } from "@/components/booking/tz-detect";
import { TzPicker } from "@/components/booking/tz-picker";
import { addDays, fmtDateTime, fmtTime, isValidTimezone, timezoneList, todayIn } from "@/lib/time";
import {
  availableSlots,
  getBookingByToken,
  getEventType,
  getProfileByUsername,
  locationLabel,
} from "@/server/scheduling";
import { formatPrice, paymentsConfigured } from "@/server/payments";
import { getCurrentWorkspace } from "@/server/workspace";
import { BookingForm } from "./booking-form";

export async function generateMetadata({
  params,
}: PageProps<"/[username]/[event]">): Promise<Metadata> {
  const { username, event } = await params;
  const ws = await getCurrentWorkspace();
  const p = ws ? await getProfileByUsername(ws.id, username) : null;
  const et = ws && p ? await getEventType(ws.id, p.userId, event) : null;
  return et
    ? { title: `${et.title} · ${p!.displayName}`, description: et.description ?? undefined }
    : {};
}

async function EventPage({ params, searchParams }: PageProps<"/[username]/[event]">) {
  const [{ username, event }, sp] = await Promise.all([params, searchParams]);
  const ws = await getCurrentWorkspace();
  const profile = ws ? await getProfileByUsername(ws.id, username) : null;
  const et = ws && profile ? await getEventType(ws.id, profile.userId, event) : null;
  if (!ws || !profile || !et) notFound();

  const tzParam = typeof sp.tz === "string" && isValidTimezone(sp.tz) ? sp.tz : null;
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
  const days = await availableSlots(et, tz, monthStart, monthEnd);
  const availableDates = new Set(days.map((d) => d.date));
  const daySlots = date ? (days.find((d) => d.date === date)?.slots ?? []) : [];
  const base = `/${profile.username}/${et.slug}`;
  const makeHref = (over: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    const merged = { tz: tzParam ?? undefined, month, date, reschedule, ...over } as Record<
      string,
      string | undefined
    >;
    for (const [k, v] of Object.entries(merged)) if (v) q.set(k, v);
    const s = q.toString();
    return s ? `${base}?${s}` : base;
  };

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-12">
      <Suspense fallback={null}>
        <TzDetect />
      </Suspense>
      <div className="grid gap-8 rounded-2xl border md:grid-cols-[260px_1fr]">
        <aside className="border-b p-6 md:border-r md:border-b-0">
          <Link
            href={`/${profile.username}`}
            className="text-sm text-muted-foreground hover:underline"
          >
            ← {profile.displayName}
          </Link>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">{et.title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {et.durationMin} min · {locationLabel(et.location)}
            {et.priceCents && paymentsConfigured()
              ? ` · ${formatPrice(et.priceCents, et.currency)}`
              : ""}
          </p>
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
            <p className="mt-4 rounded-lg border p-3 text-sm">
              <span className="font-medium">{fmtDateTime(slot, tz)}</span>
            </p>
          )}
          <div className="mt-4">
            <Suspense fallback={null}>
              <TzPicker value={tz} zones={timezoneList()} />
            </Suspense>
          </div>
        </aside>

        <section className="p-6">
          {slot && !Number.isNaN(slot.getTime()) ? (
            <div className="max-w-md">
              <Link
                href={makeHref({ slot: undefined })}
                className="text-sm text-muted-foreground hover:underline"
              >
                ← Pick another time
              </Link>
              <h2 className="mt-3 mb-4 text-lg font-semibold">Your details</h2>
              <BookingForm
                username={profile.username}
                event={et.slug}
                slot={slot.toISOString()}
                tz={tz}
                questions={et.questions}
                reschedule={reschedule}
                paid={!!et.priceCents && paymentsConfigured()}
                defaults={prev ? { name: prev.attendeeName, email: prev.attendeeEmail } : undefined}
              />
            </div>
          ) : (
            <div className="grid gap-8 md:grid-cols-[1fr_180px]">
              <MonthCalendar
                month={month}
                availableDates={availableDates}
                selected={date}
                today={today}
                makeHref={makeHref}
              />
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
                <ul className="max-h-80 space-y-2 overflow-y-auto pr-1">
                  {daySlots.map((s) => (
                    <li key={s.toISOString()}>
                      <Link
                        href={makeHref({ slot: s.toISOString() })}
                        className="block rounded-lg border px-3 py-2 text-center text-sm font-medium hover:border-primary hover:text-primary"
                      >
                        {fmtTime(s, tz)}
                      </Link>
                    </li>
                  ))}
                  {date && daySlots.length === 0 && (
                    <li className="text-sm text-muted-foreground">No times left this day.</li>
                  )}
                </ul>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export default function EventPageBoundary(props: PageProps<"/[username]/[event]">) {
  return (
    <Suspense fallback={null}>
      <EventPage {...props} />
    </Suspense>
  );
}
