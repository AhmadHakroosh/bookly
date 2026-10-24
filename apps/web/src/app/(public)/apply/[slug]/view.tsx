import type { Workspace } from "@bookly/db/schema";
import type { Answers } from "@bookly/forms";
import { rawFrom, type Uploaded } from "@/components/forms/raw";
import { ApplyForm } from "@/components/hiring/apply-form";
import { LocalTime } from "@/components/hiring/local-time";
import { buttonVariants } from "@/components/ui/button";
import { applyWindow, type PublicOpportunity } from "@/server/hiring/apply";
import {
  COPY,
  fmtDay,
  fmtDayTime,
  graceEnds,
  identityFields,
  minutesToComplete,
  whatHappensNext,
} from "@/server/hiring/apply-text";
import { PublicContainer } from "../../container";

/**
 * P1 (the summary) with the form below it (P2–P4). Server-rendered, so a candidate on a slow
 * phone reads everything before any script runs; the form enhances. A resumed draft starts the
 * form where it was left.
 */
export function ApplyView({
  ws,
  p,
  draft,
}: {
  ws: Pick<Workspace, "name">;
  p: NonNullable<PublicOpportunity>;
  draft?: { token: string; answers: Answers; startedAt: Date; files: Uploaded[] } | null;
}) {
  const { opportunity: opp, cohort, form, timezone: tz } = p;
  const window = applyWindow(p, draft?.startedAt);
  const closes = cohort?.closesAt ?? null;
  const decides = cohort?.decidesBy ?? null;
  const notice = opp.settings.privacyNotice?.text ?? "";
  const steps = whatHappensNext(p.stages, { closesAt: closes, decidesBy: decides, timezone: tz });
  const taking = (window === "open" || window === "grace") && !!form;
  const facts = [
    closes && (
      <>
        Closes <LocalTime iso={closes.toISOString()} programZone={tz} />
      </>
    ),
    form && <>Takes about {minutesToComplete(form.schema)} minutes</>,
    decides && <>Decisions by {fmtDay(decides, tz)}</>,
  ].filter(Boolean);
  return (
    <PublicContainer className="py-10">
      <div className="max-w-[720px] space-y-8">
        {p.preview && (
          <p
            role="status"
            className="rounded-lg border border-warning/40 bg-warning-muted px-4 py-2 text-sm font-medium"
          >
            {COPY.previewBanner}
          </p>
        )}
        <header className="space-y-3">
          <h1 className="text-3xl font-semibold tracking-tight text-balance">{opp.title}</h1>
          {cohort?.name && <p className="text-muted-foreground">{cohort.name}</p>}
          {facts.length > 0 && (
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {facts.map((f, i) => (
                <li
                  key={i}
                  className="before:me-4 before:text-muted-foreground before:content-['·'] first:before:hidden"
                >
                  {f}
                </li>
              ))}
            </ul>
          )}
          {window === "scheduled" && cohort?.opensAt && (
            <p className="rounded-lg bg-muted px-4 py-3 text-sm">
              {COPY.scheduled(fmtDayTime(cohort.opensAt, tz))}
            </p>
          )}
          {window === "closed" && closes && (
            <p className="rounded-lg bg-muted px-4 py-3 text-sm">
              {COPY.closed(opp.title, fmtDay(closes, tz), decides ? fmtDay(decides, tz) : null)}
            </p>
          )}
          {window === "grace" && closes && (
            <p
              role="status"
              className="rounded-lg border border-warning/40 bg-warning-muted px-4 py-3 text-sm"
            >
              {COPY.grace(fmtDayTime(graceEnds(closes, p.graceMinutes)!, tz))}
            </p>
          )}
          {taking && !draft && (
            <a href="#application" className={buttonVariants({ variant: "ink", size: "lg" })}>
              {COPY.start}
            </a>
          )}
        </header>

        <section aria-labelledby="next-title" className="space-y-3">
          <h2 id="next-title" className="text-lg font-semibold">
            What happens next
          </h2>
          <ol className="space-y-2 text-sm">
            {steps.map((s, i) => (
              <li key={i} className="flex gap-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold">
                  {i + 1}
                </span>
                <span>
                  <span className="font-medium">{s.title}</span> {s.body}
                </span>
              </li>
            ))}
          </ol>
        </section>

        {(opp.summary || opp.description) && (
          <section aria-labelledby="about-title" className="space-y-2">
            <h2 id="about-title" className="text-lg font-semibold">
              About this opportunity
            </h2>
            {opp.summary && <p className="text-sm">{opp.summary}</p>}
            {opp.description && <p className="text-sm whitespace-pre-line">{opp.description}</p>}
          </section>
        )}

        <section aria-labelledby="who-title" className="space-y-2">
          <h2 id="who-title" className="text-lg font-semibold">
            Who sees your application
          </h2>
          <ul className="list-disc space-y-1 ps-5 text-sm">
            {COPY.whoSees.split(". ").map((s) => (
              <li key={s}>{s.replace(/\.$/, "")}.</li>
            ))}
          </ul>
          {opp.settings.accommodations !== false && (
            <p className="text-sm">{COPY.adjustmentsNote}</p>
          )}
          <p className="text-sm font-medium">{COPY.sixteen}</p>
        </section>

        {notice && (
          <section aria-labelledby="privacy-title" className="space-y-2">
            <h2 id="privacy-title" className="text-lg font-semibold">
              Your privacy
            </h2>
            <p className="text-sm text-muted-foreground">{notice.split("\n\n")[0]}</p>
            <details className="text-sm">
              <summary className="cursor-pointer text-primary underline-offset-2 hover:underline">
                Read the full notice
              </summary>
              <p className="mt-2 whitespace-pre-line text-muted-foreground">{notice}</p>
            </details>
          </section>
        )}

        {opp.settings.replyTo && (
          <p className="text-sm">
            Questions?{" "}
            <a
              href={`mailto:${opp.settings.replyTo}`}
              className="text-primary underline underline-offset-2"
            >
              {opp.settings.replyTo}
            </a>
          </p>
        )}

        {taking && form && (
          <section
            id="application"
            aria-label="Your application"
            className="scroll-mt-6 rounded-2xl border bg-card p-5 sm:p-6"
          >
            {draft && (
              <p role="status" className="mb-4 rounded-lg bg-accent px-3 py-2 text-sm">
                Welcome back. Your answers are as you left them.
              </p>
            )}
            <ApplyForm
              mode="apply"
              title={opp.title}
              slug={opp.slug}
              formId={form.id}
              schema={form.schema}
              workspaceName={opp.settings.senderName || ws.name}
              initial={
                draft
                  ? { token: draft.token, raw: rawFrom(form.schema, draft.answers, draft.files) }
                  : undefined
              }
              askAccommodations={opp.settings.accommodations !== false}
              notice={notice}
              preview={p.preview}
              emailFieldId={identityFields(form.schema).email?.id ?? null}
            />
          </section>
        )}
      </div>
    </PublicContainer>
  );
}
