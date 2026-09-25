import Link from "next/link";

/**
 * One offered time on the booking page: the time, and for group sessions how many seats are
 * left. A full session is dashed and leads to the waitlist instead of the form.
 */
export function SlotChip({
  href,
  time,
  note,
  full = false,
}: {
  href: string;
  time: string;
  note?: string;
  full?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`block rounded-lg border px-2 py-2 text-center text-sm transition-colors hover:border-primary hover:text-primary ${
        full ? "border-dashed text-muted-foreground" : "font-medium"
      }`}
    >
      <span className="block">{time}</span>
      {note && (
        <span className="mt-0.5 block text-[11px] leading-tight font-normal text-muted-foreground">
          {note}
        </span>
      )}
    </Link>
  );
}
