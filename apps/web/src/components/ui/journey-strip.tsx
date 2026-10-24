import Link from "next/link";
import { CheckIcon } from "lucide-react";
import { cn } from "cn";

/** The client journey every contact shows (concept fidelity §3, decision D3). */
export const CLIENT_JOURNEY = ["Booked", "Prepared", "Met", "Followed up", "Paid"] as const;

export type JourneyStep = {
  label: string;
  state: "done" | "current" | "todo";
  /** The record behind the step: the booking, the briefing, the recap, the proposal, the payment. */
  href?: string;
  /** "Oct 12", "Briefing ready". */
  detail?: string;
};

/**
 * Where a person is in their journey: Booked → Prepared → Met → Followed up → Paid
 * (`marketing ui 1/2.png`). Done steps are filled Bookly Orange with a tick, the current one is
 * ringed, the rest are outlined; each links to its record when there is one. It scrolls
 * sideways on a phone rather than wrapping.
 */
function JourneyStrip({
  steps,
  label = "Client journey",
  className,
}: {
  steps: JourneyStep[];
  label?: string;
  className?: string;
}) {
  return (
    <ol
      aria-label={label}
      data-slot="journey-strip"
      className={cn("flex overflow-x-auto rounded-xl border bg-card p-4", className)}
    >
      {steps.map((s, i) => {
        const body = (
          <>
            <span
              className={cn(
                "flex size-8 items-center justify-center rounded-full border-2 text-xs font-semibold",
                s.state === "done" && "border-brand bg-brand text-white",
                s.state === "current" && "border-brand bg-accent text-accent-foreground",
                s.state === "todo" && "border-border bg-card text-muted-foreground",
              )}
              aria-hidden
            >
              {s.state === "done" ? <CheckIcon className="size-4" /> : i + 1}
            </span>
            <span
              className={cn(
                "text-sm",
                s.state === "todo" ? "text-muted-foreground" : "font-medium text-foreground",
              )}
            >
              {s.label}
              <span className="sr-only">
                {s.state === "done" ? " (done)" : s.state === "current" ? " (current step)" : ""}
              </span>
            </span>
            {s.detail && <span className="text-xs text-muted-foreground">{s.detail}</span>}
          </>
        );
        return (
          <li
            key={s.label}
            aria-current={s.state === "current" ? "step" : undefined}
            className={cn(
              "relative flex min-w-28 flex-1 flex-col items-center text-center",
              // The line to the next step, from this circle's edge.
              "after:absolute after:start-[calc(50%+1.25rem)] after:end-[calc(-50%+1.25rem)] after:top-4 after:h-0.5 last:after:hidden",
              s.state === "done" ? "after:bg-brand" : "after:bg-border",
            )}
          >
            {s.href ? (
              <Link
                href={s.href}
                className="flex flex-col items-center gap-1.5 rounded-lg px-1 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {body}
              </Link>
            ) : (
              <span className="flex flex-col items-center gap-1.5 px-1">{body}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

export { JourneyStrip };
