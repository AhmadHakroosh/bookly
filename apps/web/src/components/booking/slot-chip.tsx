import Link from "next/link";

/**
 * One offered time on the booking page: the time, and for group sessions how many seats are
 * left. A full session is dashed; with a waitlist it links to the form, otherwise it is inert.
 */
export function SlotChip({
  href,
  time,
  note,
  full = false,
}: {
  href?: string;
  time: string;
  note?: string;
  full?: boolean;
}) {
  const inner = (
    <>
      <span className="block">{time}</span>
      {note && (
        <span className="mt-0.5 block text-[11px] leading-tight font-normal text-muted-foreground">
          {note}
        </span>
      )}
    </>
  );
  const base = "block rounded-lg border px-2 py-2 text-center text-sm";
  if (!href)
    return (
      <span className={`${base} border-dashed text-muted-foreground`} aria-disabled>
        {inner}
      </span>
    );
  return (
    <Link
      href={href}
      className={`${base} transition-colors hover:border-primary hover:text-primary ${
        full ? "border-dashed text-muted-foreground" : "font-medium"
      }`}
    >
      {inner}
    </Link>
  );
}
