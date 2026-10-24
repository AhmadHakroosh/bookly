import Link from "next/link";
import { CheckIcon, CircleAlertIcon, CircleIcon } from "lucide-react";
import { cn } from "cn";
import { SETUP_STEPS, STEP_LABELS, type SetupStep } from "@/server/hiring/setup-text";

type Status = "done" | "needs_work" | "todo";

/**
 * The wizard's steps (S1): Start · Basics · Stages · Team · Privacy · Publish, each with a done
 * or needs-work mark in words as well as an icon. A `nav` with `aria-current="step"`; on a phone
 * it is a row that scrolls sideways.
 */
export function StepRail({
  current,
  status,
  href,
}: {
  current: "start" | SetupStep;
  status?: Partial<Record<"start" | SetupStep, "done" | "needs_work">>;
  /** The link of a step; none before the draft exists. */
  href?: (step: SetupStep) => string;
}) {
  const steps = ["start", ...SETUP_STEPS] as const;
  return (
    <nav aria-label="Setup steps">
      <ol className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
        {steps.map((s, i) => {
          const st: Status = s === current ? "todo" : (status?.[s] ?? "todo");
          const Icon =
            st === "done" ? CheckIcon : st === "needs_work" ? CircleAlertIcon : CircleIcon;
          const body = (
            <>
              <Icon
                aria-hidden
                className={cn(
                  "size-4 shrink-0",
                  st === "done" && "text-success",
                  st === "needs_work" && "text-warning",
                  st === "todo" && "text-muted-foreground/60",
                )}
              />
              <span>
                <span className="sr-only">Step {i + 1}: </span>
                {STEP_LABELS[s]}
                {s !== current && st !== "todo" && (
                  <span className="sr-only">{st === "done" ? ", done" : ", needs work"}</span>
                )}
              </span>
            </>
          );
          const cls = cn(
            "flex items-center gap-2 rounded-lg px-3 py-2 text-sm whitespace-nowrap",
            s === current ? "bg-accent font-medium text-foreground" : "text-muted-foreground",
          );
          return (
            <li key={s}>
              {s !== "start" && href && s !== current ? (
                <Link href={href(s)} className={cn(cls, "hover:bg-muted hover:text-foreground")}>
                  {body}
                </Link>
              ) : (
                <span className={cls} aria-current={s === current ? "step" : undefined}>
                  {body}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
