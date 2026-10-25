import Link from "next/link";
import { CheckIcon, ChevronRightIcon } from "lucide-react";
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
 * Where a person is in their journey: Booked → Prepared → Met → Followed up → Paid, drawn as
 * the website draws it (`marketing ui 1/2.png`): a numbered circle, the step and one line under
 * it, chevrons between. Done steps are ticked, the current one sits in a Peach pill with a
 * filled orange number, the rest are outlined; each links to its record when there is one. It
 * scrolls sideways on a phone rather than wrapping.
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
      className={cn(
        "flex [scrollbar-width:none] items-center gap-1 overflow-x-auto rounded-xl border bg-card p-1.5",
        className,
      )}
    >
      {steps.map((s, i) => {
        const body = (
          <>
            <span
              className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tabular-nums",
                s.state === "done" && "border-success bg-success text-white",
                s.state === "current" && "border-primary bg-primary text-primary-foreground",
                s.state === "todo" && "bg-card text-muted-foreground",
              )}
              aria-hidden
            >
              {s.state === "done" ? (
                <CheckIcon className="size-4" />
              ) : (
                String(i + 1).padStart(2, "0")
              )}
            </span>
            <span className="min-w-0 text-left">
              <span
                className={cn(
                  "block text-sm font-semibold whitespace-nowrap",
                  s.state === "current" && "text-primary",
                  s.state === "todo" && "font-medium text-muted-foreground",
                )}
              >
                {s.label}
                <span className="sr-only">
                  {s.state === "done" ? " (done)" : s.state === "current" ? " (current step)" : ""}
                </span>
              </span>
              {s.detail && (
                <span className="block text-xs whitespace-nowrap text-muted-foreground">
                  {s.detail}
                </span>
              )}
            </span>
          </>
        );
        const cls = cn(
          "flex flex-1 items-center gap-2.5 rounded-lg px-2.5 py-2",
          s.state === "current" && "bg-accent",
        );
        return (
          <li
            key={s.label}
            aria-current={s.state === "current" ? "step" : undefined}
            className="flex min-w-max flex-1 items-center gap-1"
          >
            {s.href ? (
              <Link
                href={s.href}
                className={cn(
                  cls,
                  "outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50",
                  s.state === "current" && "hover:bg-accent",
                )}
              >
                {body}
              </Link>
            ) : (
              <span className={cls}>{body}</span>
            )}
            {i < steps.length - 1 && (
              <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            )}
          </li>
        );
      })}
    </ol>
  );
}

export { JourneyStrip };
