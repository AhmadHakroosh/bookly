import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  layoutDay,
  monthGrid,
  startDate,
  stepDate,
  viewTitle,
  visibleHours,
  weekDays,
  type CalendarView,
} from "@/lib/calendar";
import { fmtTime, minToHHMM } from "@/lib/time";
import { cn } from "@/lib/utils";
import { safeColor, type ViewBooking } from "@/server/bookings-view";
import { groupSessions } from "@/server/sessions";
import { CalendarKeys } from "./view-controls";

/*
 * The bookings calendar, rendered on the server: a month grid of day cells, or a day / week
 * time grid with each booking a block positioned by its local start and length. Every booking
 * is a link that opens it in the side pane; blocks are tinted with the event type's colour.
 * Everything is keyboard reachable (Tab through blocks, arrows step the range).
 */

const HOUR_PX = 48;

type Item = ViewBooking & { seatsTaken?: number; seats?: number };

/** A group session is one block ("3 / 4"), opening its first attendee's booking. */
export function collapse(rows: ViewBooking[]): Item[] {
  return groupSessions(rows).map((g) =>
    g.kind === "single" ? g.booking : { ...g.bookings[0]!, seatsTaken: g.taken, seats: g.seats },
  );
}

export type HrefFor = (params: Record<string, string | null>) => string;

function tint(color: string, alpha: string) {
  return `color-mix(in oklab, ${color} ${alpha}, transparent)`;
}

function Block({
  b,
  href,
  tz,
  style,
  compact,
}: {
  b: Item;
  href: string;
  tz: string;
  style?: React.CSSProperties;
  compact?: boolean;
}) {
  const color = safeColor(b.eventColor);
  const pending = b.status === "pending";
  return (
    <Link
      href={href}
      scroll={false}
      title={
        b.seats
          ? `${fmtTime(b.startAt, tz)} ${b.eventTitle ?? "Group session"}, ${b.seatsTaken} of ${b.seats} seats`
          : `${fmtTime(b.startAt, tz)} ${b.eventTitle ?? "Meeting"} with ${b.attendeeName}${pending ? " (request)" : ""}`
      }
      className={cn(
        "block overflow-hidden rounded-md border-l-[3px] px-1.5 py-0.5 text-xs leading-tight text-foreground hover:brightness-110 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        pending && "border-dashed",
      )}
      style={{ borderLeftColor: color, background: tint(color, pending ? "10%" : "22%"), ...style }}
    >
      <span className="font-medium">{fmtTime(b.startAt, tz)}</span>{" "}
      <span className={compact ? "" : "block truncate"}>
        {b.seats
          ? `${b.eventTitle ?? "Group session"} · ${b.seatsTaken}/${b.seats}`
          : b.attendeeName}
      </span>
      {!compact && !b.seats && (
        <span className="block truncate text-muted-foreground">{b.eventTitle ?? "Meeting"}</span>
      )}
    </Link>
  );
}

function TimeGrid({
  days,
  rows,
  tz,
  today,
  hrefFor,
}: {
  days: string[];
  rows: ViewBooking[];
  tz: string;
  today: string;
  hrefFor: HrefFor;
}) {
  const items = collapse(rows);
  const placedByDay = days.map((d) => layoutDay(items, d, tz));
  const [fromH, toH] = visibleHours(placedByDay.flat());
  const hours = Array.from({ length: toH - fromH }, (_, i) => fromH + i);
  const height = (toH - fromH) * HOUR_PX;
  const single = days.length === 1;
  return (
    <div className="overflow-x-auto rounded-xl border">
      <div
        className="grid min-w-[640px]"
        style={{ gridTemplateColumns: `3.5rem repeat(${days.length}, minmax(0, 1fr))` }}
      >
        <div className="border-b" />
        {days.map((d) => {
          const at = new Date(`${d}T12:00:00Z`);
          return (
            <Link
              key={d}
              href={hrefFor({ cal: "day", date: d, booking: null })}
              scroll={false}
              className={cn(
                "border-b border-l px-2 py-1.5 text-center text-xs hover:bg-muted/40",
                d === today && "font-semibold text-foreground",
              )}
              aria-label={`Day view for ${at.toLocaleDateString("en", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" })}`}
            >
              <span className="text-muted-foreground">
                {at.toLocaleDateString("en", { weekday: "short", timeZone: "UTC" })}
              </span>{" "}
              <span
                className={cn(
                  "inline-flex size-6 items-center justify-center rounded-full",
                  d === today && "bg-primary text-primary-foreground",
                )}
              >
                {Number(d.slice(8))}
              </span>
            </Link>
          );
        })}
        <div className="relative" style={{ height }}>
          {hours.map((h, i) => (
            <span
              key={h}
              className="absolute right-2 -translate-y-1/2 text-[10px] text-muted-foreground tabular-nums"
              style={{ top: i * HOUR_PX }}
            >
              {i === 0 ? "" : minToHHMM(h * 60)}
            </span>
          ))}
        </div>
        {days.map((d, di) => (
          <div
            key={d}
            className={cn("relative border-l", d === today && "bg-primary/[0.03]")}
            style={{ height }}
          >
            {hours.map((h, i) => (
              <div
                key={h}
                className="absolute inset-x-0 border-t border-dashed border-border/60"
                style={{ top: i * HOUR_PX }}
                aria-hidden
              />
            ))}
            {placedByDay[di]!.map((p) => {
              const top = ((p.startMin - fromH * 60) / 60) * HOUR_PX;
              const h = Math.max(((p.endMin - p.startMin) / 60) * HOUR_PX - 2, 18);
              const width = 100 / p.cols;
              return (
                <Block
                  key={p.id}
                  b={p}
                  tz={tz}
                  href={hrefFor({ booking: p.id })}
                  compact={!single && h < 34}
                  style={{
                    position: "absolute",
                    top,
                    height: h,
                    left: `calc(${p.col * width}% + 2px)`,
                    width: `calc(${width}% - 4px)`,
                  }}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function MonthGrid({
  date,
  rows,
  tz,
  today,
  hrefFor,
}: {
  date: string;
  rows: ViewBooking[];
  tz: string;
  today: string;
  hrefFor: HrefFor;
}) {
  const weeks = monthGrid(date);
  const month = date.slice(0, 7);
  const byDay = new Map<string, Item[]>();
  for (const b of collapse(rows)) {
    const d = startDate(b, tz);
    byDay.set(d, [...(byDay.get(d) ?? []), b]);
  }
  const MAX = 3;
  return (
    <div className="overflow-hidden rounded-xl border">
      <div className="grid grid-cols-7 border-b text-center text-xs text-muted-foreground">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="py-1.5">
            {d}
          </div>
        ))}
      </div>
      {weeks.map((week) => (
        <div key={week[0]} className="grid grid-cols-7">
          {week.map((d) => {
            const items = byDay.get(d) ?? [];
            const outside = d.slice(0, 7) !== month;
            return (
              <div
                key={d}
                className={cn(
                  "min-h-24 space-y-1 border-t border-l p-1 first:border-l-0 sm:min-h-28",
                  outside && "bg-muted/30",
                )}
              >
                <Link
                  href={hrefFor({ cal: "day", date: d, booking: null })}
                  scroll={false}
                  className={cn(
                    "inline-flex size-6 items-center justify-center rounded-full text-xs hover:bg-muted",
                    outside && "text-muted-foreground",
                    d === today && "bg-primary text-primary-foreground hover:bg-primary",
                  )}
                  aria-label={`Day view for ${d}${items.length ? `, ${items.length} booking${items.length === 1 ? "" : "s"}` : ""}`}
                >
                  {Number(d.slice(8))}
                </Link>
                {items.slice(0, MAX).map((b) => (
                  <Block key={b.id} b={b} tz={tz} href={hrefFor({ booking: b.id })} compact />
                ))}
                {items.length > MAX && (
                  <Link
                    href={hrefFor({ cal: "day", date: d, booking: null })}
                    scroll={false}
                    className="block px-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    +{items.length - MAX} more
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export function BookingsCalendar({
  view,
  date,
  rows,
  tz,
  today,
  hrefFor,
}: {
  view: CalendarView;
  date: string;
  rows: ViewBooking[];
  tz: string;
  today: string;
  hrefFor: HrefFor;
}) {
  const prev = hrefFor({ date: stepDate(view, date, -1), booking: null });
  const next = hrefFor({ date: stepDate(view, date, 1), booking: null });
  const todayHref = hrefFor({ date: today, booking: null });
  const viewHref = (v: CalendarView) => hrefFor({ cal: v, booking: null });
  return (
    <section aria-label="Calendar" className="space-y-3">
      <CalendarKeys
        prevHref={prev}
        nextHref={next}
        todayHref={todayHref}
        dayHref={viewHref("day")}
        weekHref={viewHref("week")}
        monthHref={viewHref("month")}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          nativeButton={false}
          render={<Link href={todayHref} scroll={false} />}
        >
          Today
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Previous ${view} (←)`}
          nativeButton={false}
          render={<Link href={prev} scroll={false} />}
        >
          <ChevronLeftIcon />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Next ${view} (→)`}
          nativeButton={false}
          render={<Link href={next} scroll={false} />}
        >
          <ChevronRightIcon />
        </Button>
        <h2 className="text-lg font-semibold tracking-tight" aria-live="polite">
          {viewTitle(view, date)}
        </h2>
        <nav aria-label="Calendar range" className="ml-auto inline-flex rounded-lg bg-muted p-1">
          {(["day", "week", "month"] as const).map((v) => (
            <Link
              key={v}
              href={viewHref(v)}
              scroll={false}
              aria-current={view === v ? "page" : undefined}
              aria-keyshortcuts={v[0]}
              className={cn(
                "inline-flex h-8 items-center rounded-md px-3 text-sm capitalize",
                view === v
                  ? "bg-background font-medium text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {v}
            </Link>
          ))}
        </nav>
      </div>
      {view === "month" ? (
        <MonthGrid date={date} rows={rows} tz={tz} today={today} hrefFor={hrefFor} />
      ) : (
        <TimeGrid
          days={view === "day" ? [date] : weekDays(date)}
          rows={rows}
          tz={tz}
          today={today}
          hrefFor={hrefFor}
        />
      )}
      <p className="text-xs text-muted-foreground">
        Times in {tz}. Keys: ← → to move, T today, D W M to switch, J K in a booking.
      </p>
    </section>
  );
}
