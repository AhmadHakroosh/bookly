import Link from "next/link";
import { CheckIcon, ThermometerIcon } from "lucide-react";
import type { MeetingRecap } from "@bookly/db/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Recap } from "@/server/recap-text";
import {
  acceptRecapActionsAction,
  applyRecapStageAction,
  markRecapReviewedAction,
  regenerateRecapAction,
} from "../../scheduling-actions";

const clock = (t: number | null) =>
  t === null
    ? ""
    : `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

function Evidence({ t, quote }: { t: number | null; quote: string | null }) {
  if (!quote && t === null) return null;
  return (
    <span className="block text-xs text-muted-foreground">
      {t !== null && <span className="font-mono">[{clock(t)}]</span>} {quote ? `“${quote}”` : ""}
    </span>
  );
}

/** The recap review: everything the assistant found, each with a one-click action. */
export function RecapPanel({
  bookingId,
  row,
  attendeeName,
  contactId,
  currentStage,
}: {
  bookingId: string;
  row: MeetingRecap;
  attendeeName: string;
  contactId: string | null;
  currentStage: string | null;
}) {
  const r = row.recap as Recap;
  const accepted = row.accepted.tasks ?? {};
  const pending = r.actions.map((_, i) => i).filter((i) => !accepted[String(i)]);
  const temp = r.temperature;
  const stageMove = r.suggestedStage && r.suggestedStage !== currentStage;
  return (
    <section className="space-y-5 rounded-xl border p-5 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold tracking-tight">Meeting recap</h2>
        <div className="flex items-center gap-2">
          {temp && (
            <Badge variant="outline" className="capitalize">
              <ThermometerIcon className="mr-1 size-3" aria-hidden />
              {temp}
            </Badge>
          )}
          {row.reviewedAt ? (
            <Badge variant="secondary">Reviewed</Badge>
          ) : (
            <form action={markRecapReviewedAction.bind(null, bookingId)}>
              <Button type="submit" variant="ghost">
                Mark reviewed
              </Button>
            </form>
          )}
          <form action={regenerateRecapAction.bind(null, bookingId)}>
            <Button type="submit" variant="ghost">
              Regenerate
            </Button>
          </form>
        </div>
      </div>

      <p className="leading-relaxed whitespace-pre-line">{r.summary}</p>

      {r.covered.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            What they asked for
          </h3>
          <ul className="mt-1 space-y-1">
            {r.covered.map((c, i) => (
              <li key={i} className="flex items-start gap-2">
                <span
                  className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border ${c.covered ? "bg-foreground text-background" : ""}`}
                  aria-hidden
                >
                  {c.covered && <CheckIcon className="size-3" />}
                </span>
                <span>
                  {c.asked}
                  {!c.covered && (
                    <span className="text-muted-foreground">
                      {" "}
                      · not covered{c.note ? `: ${c.note}` : ""}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {r.decisions.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Decisions
          </h3>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {r.decisions.map((d, i) => (
              <li key={i}>
                {d.text}
                <Evidence t={d.t} quote={d.quote} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {r.actions.length > 0 && (
        <form action={acceptRecapActionsAction.bind(null, bookingId)}>
          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Action items
          </h3>
          <ul className="mt-1 space-y-1.5">
            {r.actions.map((a, i) => {
              const taskId = accepted[String(i)];
              return (
                <li key={i} className="flex items-start gap-2">
                  {taskId ? (
                    <span
                      className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border bg-foreground text-background"
                      aria-label="Task created"
                    >
                      <CheckIcon className="size-3" />
                    </span>
                  ) : (
                    <input
                      type="checkbox"
                      name="action"
                      value={i}
                      defaultChecked
                      className="mt-1"
                      aria-label={`Create task: ${a.title}`}
                    />
                  )}
                  <span className={taskId ? "text-muted-foreground" : ""}>
                    {a.owner === "them" && <span className="font-medium">{attendeeName}: </span>}
                    {a.title}
                    {a.dueInDays !== null && (
                      <span className="text-muted-foreground">
                        {" "}
                        · in {a.dueInDays} day{a.dueInDays === 1 ? "" : "s"}
                      </span>
                    )}
                    <Evidence t={a.t} quote={a.quote} />
                  </span>
                </li>
              );
            })}
          </ul>
          {pending.length > 0 && (
            <Button type="submit" className="mt-2">
              Create {pending.length === r.actions.length ? "all" : "selected"} tasks
            </Button>
          )}
        </form>
      )}

      {(r.openQuestions.length > 0 || r.objections.length > 0) && (
        <div className="grid gap-4 sm:grid-cols-2">
          {r.openQuestions.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Open questions
              </h3>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                {r.openQuestions.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ul>
            </div>
          )}
          {r.objections.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Objections and risks
              </h3>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                {r.objections.map((o, i) => (
                  <li key={i}>
                    {o.text}
                    <Evidence t={o.t} quote={o.quote} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {(r.nextStep || stageMove) && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/50 p-3">
          <p>
            {r.nextStep && (
              <>
                <span className="font-medium">Next step: </span>
                {r.nextStep}
              </>
            )}
            {stageMove && (
              <span className="block text-muted-foreground">
                Suggested stage: <span className="capitalize">{r.suggestedStage}</span>
                {row.accepted.stage ? " (applied)" : ""}
              </span>
            )}
          </p>
          {stageMove && !row.accepted.stage && contactId && (
            <form action={applyRecapStageAction.bind(null, bookingId)}>
              <Button type="submit" variant="outline">
                Move to {r.suggestedStage}
              </Button>
            </form>
          )}
        </div>
      )}
      {contactId && (
        <p className="text-xs text-muted-foreground">
          Everything accepted here lands on{" "}
          <Link href={`/admin/contacts/${contactId}`} className="underline underline-offset-4">
            {attendeeName}&apos;s timeline
          </Link>
          .
        </p>
      )}
    </section>
  );
}
