import { Skeleton } from "@/components/ui/skeleton";

/**
 * Building blocks for per-page skeletons. Each page composes these into the same shapes,
 * widths and rhythm as the content that replaces them, so nothing jumps when data lands.
 * Only `Shell` announces itself to assistive technology; the parts inside are decorative.
 */
export function Shell({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div role="status" aria-busy aria-live="polite" aria-label="Loading" className={className}>
      {children}
    </div>
  );
}

/** Page title with an optional line underneath (and an optional eyebrow above). */
export function Heading({
  width = "w-48",
  sub = true,
  eyebrow = false,
  size = "h-7",
}: {
  width?: string;
  sub?: boolean;
  eyebrow?: boolean;
  size?: string;
}) {
  return (
    <div className="space-y-2">
      {eyebrow && <Skeleton className="h-3 w-24" />}
      <Skeleton className={`${size} ${width} max-w-full`} />
      {sub && <Skeleton className="h-4 w-80 max-w-full" />}
    </div>
  );
}

/** A title row with a button on the right (list pages). */
export function HeadingWithAction({
  width = "w-48",
  sub = true,
}: {
  width?: string;
  sub?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <Heading width={width} sub={sub} />
      <Skeleton className="h-9 w-32 rounded-lg" />
    </div>
  );
}

/** Section title (h2 size). */
export function Subheading({ width = "w-32" }: { width?: string }) {
  return <Skeleton className={`h-5 ${width}`} />;
}

/** One line of text at a given width. */
export function Line({ width = "w-full", className = "" }: { width?: string; className?: string }) {
  return <Skeleton className={`h-4 ${width} max-w-full ${className}`} />;
}

export function Button({ width = "w-28", full = false }: { width?: string; full?: boolean }) {
  return <Skeleton className={`h-9 ${full ? "w-full" : width} rounded-lg`} />;
}

/** A labelled field: label line + input box (textarea when `rows` is set). */
export function Field({ label = "w-24", rows }: { label?: string; rows?: number }) {
  return (
    <div className="space-y-2">
      <Skeleton className={`h-4 ${label}`} />
      <Skeleton className={`${rows ? "h-24" : "h-10"} w-full rounded-lg`} />
    </div>
  );
}

/** Fields laid out in a grid (`cols` on sm and up). */
export function FieldGrid({ cols, labels }: { cols: number; labels?: string[] }) {
  const grid =
    { 2: "sm:grid-cols-2", 3: "sm:grid-cols-3", 4: "sm:grid-cols-4", 5: "sm:grid-cols-5" }[cols] ??
    "";
  return (
    <div className={`grid gap-6 ${grid}`}>
      {Array.from({ length: cols }, (_, i) => (
        <Field key={i} label={labels?.[i] ?? "w-24"} />
      ))}
    </div>
  );
}

/** Stacked fields ending in a button, as the auth and setup forms are laid out. */
export function Form({ fields = 3, button = true }: { fields?: number; button?: boolean }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: fields }, (_, i) => (
        <Field key={i} />
      ))}
      {button && <Button full />}
    </div>
  );
}

/** A bordered card holding a form: title, fields, button. */
export function FormCard({ fields = 3, title = true }: { fields?: number; title?: boolean }) {
  return (
    <div className="space-y-4 rounded-xl border p-4">
      {title && (
        <div className="space-y-2">
          <Skeleton className="h-5 w-32" />
          <Line width="w-72" />
        </div>
      )}
      {Array.from({ length: fields }, (_, i) => (
        <Field key={i} />
      ))}
      <Button />
    </div>
  );
}

/** Search box + button, as list pages put above their lists. */
export function Toolbar({ buttons = 1 }: { buttons?: number }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Skeleton className="h-9 w-64 max-w-full rounded-lg" />
      {Array.from({ length: buttons }, (_, i) => (
        <Skeleton key={i} className="h-9 w-24 rounded-lg" />
      ))}
    </div>
  );
}

/** Rows inside one bordered box separated by dividers (`divide-y rounded-xl border`). */
export function DividedList({
  rows = 4,
  lines = 2,
  trailing = true,
  avatar = false,
}: {
  rows?: number;
  lines?: 1 | 2;
  trailing?: boolean;
  avatar?: boolean;
}) {
  return (
    <div className="divide-y rounded-xl border">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3">
          {avatar && <Skeleton className="size-9 shrink-0 rounded-full" />}
          <div className="min-w-0 flex-1 space-y-2">
            <Line width={i % 2 ? "w-40" : "w-56"} />
            {lines === 2 && <Line width={i % 2 ? "w-64" : "w-48"} className="h-3" />}
          </div>
          {trailing && <Skeleton className="h-6 w-16 rounded-full" />}
        </div>
      ))}
    </div>
  );
}

/** Separate bordered cards stacked with a gap (`space-y-2`/`space-y-3`), one per item. */
export function CardList({
  rows = 3,
  height = "h-20",
  gap = "space-y-3",
}: {
  rows?: number;
  height?: string;
  gap?: string;
}) {
  return (
    <div className={gap}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className={`${height} space-y-2 rounded-xl border p-4`}>
          <Line width={i % 2 ? "w-44" : "w-60"} />
          <Line width="w-80" className="h-3" />
        </div>
      ))}
    </div>
  );
}

/** A table: header row then `rows` rows of `cols` cells. */
export function Table({ rows = 3, cols = 4 }: { rows?: number; cols?: number }) {
  const cells = Array.from({ length: cols });
  return (
    <div className="overflow-hidden rounded-xl border">
      <div className="flex gap-4 border-b bg-muted/40 px-4 py-2.5">
        {cells.map((_, i) => (
          <Skeleton key={i} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex gap-4 border-b px-4 py-3 last:border-b-0">
          {cells.map((_, i) => (
            <Skeleton key={i} className={`h-4 flex-1 ${i === cols - 1 ? "max-w-16" : ""}`} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** A row of small stat cards. */
export function Stats({
  n = 4,
  cols = "sm:grid-cols-2 lg:grid-cols-4",
}: {
  n?: number;
  cols?: string;
}) {
  return (
    <div className={`grid gap-3 ${cols}`}>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="space-y-2 rounded-xl border p-4">
          <Line width="w-20" className="h-3" />
          <Skeleton className="h-7 w-16" />
        </div>
      ))}
    </div>
  );
}

/** A bordered card with a title and a block of content. */
export function Card({ height = "h-32", title = true }: { height?: string; title?: boolean }) {
  return (
    <div className="space-y-3 rounded-xl border p-5">
      {title && <Skeleton className="h-5 w-36" />}
      <Skeleton className={`${height} w-full rounded-lg`} />
    </div>
  );
}

/** Definition rows (label · value), as booking and workspace details are shown. */
export function Details({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3 rounded-xl border p-5">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex gap-4">
          <Skeleton className="h-4 w-16 shrink-0" />
          <Line width={i % 2 ? "w-48" : "w-64"} />
        </div>
      ))}
    </div>
  );
}

/** Paragraphs of running text, for docs and long descriptions. */
export function Prose({ lines = 10 }: { lines?: number }) {
  const widths = ["w-full", "w-11/12", "w-full", "w-5/6", "w-full", "w-2/3"];
  return (
    <div className="space-y-3">
      {Array.from({ length: lines }, (_, i) => (
        <Line key={i} width={widths[i % widths.length]} />
      ))}
    </div>
  );
}

/** Seven weekday rows: a label, a time range and a switch, as the availability editor shows. */
export function WeekRows() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 7 }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-5 w-5 rounded" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-9 w-24 rounded-lg" />
          <Skeleton className="h-4 w-3" />
          <Skeleton className="h-9 w-24 rounded-lg" />
          <Skeleton className="ml-auto h-6 w-14 rounded-full" />
        </div>
      ))}
    </div>
  );
}

/** A month grid: weekday initials then 5 rows of 7 cells. */
export function MonthGrid() {
  return (
    <div className="max-w-sm space-y-3">
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-32" />
        <div className="flex gap-2">
          <Skeleton className="h-7 w-7 rounded-md" />
          <Skeleton className="h-7 w-7 rounded-md" />
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: 42 }, (_, i) => (
          <Skeleton
            key={i}
            className={`aspect-square rounded-md ${i < 7 ? "h-4 self-center" : ""}`}
          />
        ))}
      </div>
    </div>
  );
}

/** Time chips in the grid the event page uses. */
export function SlotGrid({ n = 8 }: { n?: number }) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
      {Array.from({ length: n }, (_, i) => (
        <Skeleton key={i} className="h-9 rounded-lg" />
      ))}
    </div>
  );
}

/** A circle for an avatar. */
export function Avatar({ size = "size-12" }: { size?: string }) {
  return <Skeleton className={`${size} shrink-0 rounded-full`} />;
}

/** The public-page frame: the same centered column the real pages render in. */
export function PublicFrame({
  width = "max-w-2xl",
  className = "py-12",
  children,
}: {
  width?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`mx-auto w-full max-w-4xl px-4 ${className}`}>
      <div className={`mx-auto ${width}`}>{children}</div>
    </div>
  );
}
