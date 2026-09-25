import Link from "next/link";
import { addDays } from "@/lib/time";

/** Server-rendered month grid; days with slots link to ?date=. */
export function MonthCalendar({
  month,
  availableDates,
  selected,
  today,
  makeHref,
}: {
  month: string;
  availableDates: Set<string>;
  selected?: string;
  today: string;
  makeHref: (params: Record<string, string | undefined>) => string;
}) {
  const [y, m] = month.split("-").map(Number);
  const first = `${month}-01`;
  const firstWeekday = new Date(Date.UTC(y!, m! - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(y!, m!, 0)).getUTCDate();
  const prev = m === 1 ? `${y! - 1}-12` : `${y}-${String(m! - 1).padStart(2, "0")}`;
  const next = m === 12 ? `${y! + 1}-01` : `${y}-${String(m! + 1).padStart(2, "0")}`;
  const label = new Date(Date.UTC(y!, m! - 1, 1)).toLocaleDateString("en", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const cells: (string | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => addDays(first, i)),
  ];
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="font-medium">{label}</p>
        <div className="flex gap-1">
          <Link
            href={makeHref({ month: prev, date: undefined, slot: undefined })}
            aria-label="Previous month"
            className="rounded-md border px-2 py-0.5 text-sm hover:bg-muted"
          >
            ‹
          </Link>
          <Link
            href={makeHref({ month: next, date: undefined, slot: undefined })}
            aria-label="Next month"
            className="rounded-md border px-2 py-0.5 text-sm hover:bg-muted"
          >
            ›
          </Link>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-muted-foreground uppercase">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((d, i) =>
          d ? (
            availableDates.has(d) ? (
              <Link
                key={d}
                href={makeHref({ date: d, slot: undefined })}
                className={`flex aspect-square items-center justify-center rounded-md text-sm font-medium tabular-nums transition-colors ${selected === d ? "bg-muted ring-1 ring-foreground" : "bg-muted hover:bg-muted/70"}`}
                aria-current={selected === d ? "date" : undefined}
              >
                {Number(d.slice(-2))}
              </Link>
            ) : (
              <span
                key={d}
                className={`flex aspect-square items-center justify-center text-sm text-muted-foreground tabular-nums ${d === today ? "underline underline-offset-4" : ""}`}
              >
                {Number(d.slice(-2))}
              </span>
            )
          ) : (
            <span key={`e${i}`} />
          ),
        )}
      </div>
    </div>
  );
}
