import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CalendarPlusIcon, DownloadIcon } from "lucide-react";
import { flattenAnswers } from "@bookly/forms";
import {
  AdjustmentsForm,
  DeleteButton,
  PrintButton,
  RecoverForm,
  WithdrawButton,
} from "@/components/hiring/status-actions";
import { buttonVariants } from "@/components/ui/button";
import { hasFlag } from "@/server/flags";
import { statusByToken } from "@/server/hiring/apply";
import { COPY, DELETION_DAYS, fmtDay, statusCard } from "@/server/hiring/apply-text";
import { getCurrentWorkspace } from "@/server/workspace";
import { PublicContainer, PublicSkeleton } from "../../container";

export const metadata: Metadata = { title: "Your application", robots: { index: false } };

/**
 * P6, the candidate's status page (no account: the link is the key). The status card first
 * (the candidate-facing label, never an internal stage name, hold or unreleased decision), then
 * what to do, the timeline, their answers, adjustments, their data and withdraw. Arriving from
 * the form it opens with the confirmation (P5).
 */
async function StatusPage({ params, searchParams }: PageProps<"/applications/[token]">) {
  const [{ token }, sp, ws] = await Promise.all([params, searchParams, getCurrentWorkspace()]);
  if (!ws || !(await hasFlag(ws, "hiring"))) notFound();
  const r = await statusByToken(ws, token);
  if (r.kind === "deleted")
    return (
      <PublicContainer>
        <div className="max-w-[640px] space-y-2">
          <h1 className="text-2xl font-semibold">{COPY.deleted}</h1>
          <p className="text-sm text-muted-foreground">
            Nothing you sent us is kept beyond a record that you asked.
          </p>
        </div>
      </PublicContainer>
    );
  if (r.kind !== "ok")
    return (
      <PublicContainer>
        <div className="max-w-[480px] space-y-4">
          <h1 className="text-2xl font-semibold">{COPY.expired}</h1>
          <p className="text-sm text-muted-foreground">{COPY.recoverHelp}</p>
          <RecoverForm />
        </div>
      </PublicContainer>
    );
  const v = r.view;
  const app = v.application;
  const tz = v.timezone;
  const decides = v.cohort?.decidesBy ? fmtDay(v.cohort.decidesBy, tz) : null;
  const card = statusCard({
    state: app.state,
    label: v.released ? v.label : "Under review",
    category: v.released ? v.category : "open",
    isEntry: v.isEntry,
    isWaitlist: v.released && v.isWaitlist,
    decidesBy: decides,
    withdrawnOn: app.withdrawnAt ? fmtDay(app.withdrawnAt, tz) : null,
  });
  const flat = v.form ? flattenAnswers(v.form, v.answers) : {};
  const filesByField = new Map<string, string[]>();
  for (const f of v.files)
    filesByField.set(f.sourceId ?? "", [...(filesByField.get(f.sourceId ?? "") ?? []), f.name]);
  const isNew = sp.new === "1";
  const timeline = [
    app.submittedAt && { at: app.submittedAt, text: "Application submitted" },
    v.revision > 1 && { at: app.lastActivityAt, text: "Application updated" },
    app.withdrawnAt && { at: app.withdrawnAt, text: "Application withdrawn" },
    v.request && { at: v.request.requestedAt, text: "Deletion requested" },
  ].filter(Boolean) as { at: Date; text: string }[];
  return (
    <PublicContainer className="py-10">
      <div className="max-w-[640px] space-y-8">
        {isNew && (
          <section aria-labelledby="received-title" className="space-y-3">
            <h1 id="received-title" className="text-3xl font-semibold tracking-tight">
              {COPY.received}
            </h1>
            <p className="text-sm">{COPY.receivedBody(v.opportunity.title, v.email, decides)}</p>
            <p className="text-sm text-muted-foreground">
              Keep this page: it is your status link, and it&apos;s in our email too.
            </p>
            <div className="flex flex-wrap gap-2 print:hidden">
              {v.cohort?.decidesBy && (
                <a
                  href={`/applications/${token}/calendar`}
                  className={buttonVariants({ variant: "outline" })}
                >
                  <CalendarPlusIcon data-icon="inline-start" aria-hidden />
                  Add the decision date to your calendar
                </a>
              )}
              <PrintButton />
            </div>
          </section>
        )}
        {sp.updated === "1" && (
          <p role="status" className="rounded-lg bg-accent px-4 py-3 text-sm">
            Your changes are saved. We&apos;ve emailed you a confirmation.
          </p>
        )}

        <header className="space-y-1">
          {!isNew && <p className="text-sm text-muted-foreground">Your application</p>}
          {isNew ? (
            <h2 className="text-xl font-semibold">{v.opportunity.title}</h2>
          ) : (
            <h1 className="text-2xl font-semibold tracking-tight">{v.opportunity.title}</h1>
          )}
          {v.cohort?.name && <p className="text-sm text-muted-foreground">{v.cohort.name}</p>}
        </header>

        {/* The one place with the brand fill: what's happening, in words first. */}
        <section
          aria-label="Status"
          className="rounded-2xl bg-primary px-5 py-5 text-primary-foreground"
        >
          <p className="text-xs font-medium tracking-wide uppercase opacity-90">Status</p>
          <p className="mt-1 text-xl font-semibold">{card.title}</p>
          <p className="mt-1 text-sm opacity-95">{card.body}</p>
        </section>

        {v.request && (
          <p role="status" className="rounded-lg border px-4 py-3 text-sm">
            {v.request.status === "held" && v.request.holdReason
              ? COPY.legalHold(v.opportunity.settings.senderName || ws.name, v.request.holdReason)
              : COPY.deletionRequested(
                  fmtDay(v.request.requestedAt, tz),
                  fmtDay(
                    new Date(v.request.requestedAt.getTime() + DELETION_DAYS * 86_400_000),
                    tz,
                  ),
                )}
          </p>
        )}

        {app.state === "active" && (
          <section aria-labelledby="todo-title" className="space-y-2">
            <h2 id="todo-title" className="text-lg font-semibold">
              Things to do
            </h2>
            <p className="text-sm text-muted-foreground">{COPY.nothingToDo}</p>
          </section>
        )}

        {timeline.length > 0 && (
          <section aria-labelledby="timeline-title" className="space-y-2">
            <h2 id="timeline-title" className="text-lg font-semibold">
              Timeline
            </h2>
            <ol className="space-y-1 border-s ps-4 text-sm">
              {timeline.map((t) => (
                <li key={t.text}>
                  <span className="text-muted-foreground">{fmtDay(t.at, tz)}</span> · {t.text}
                </li>
              ))}
            </ol>
          </section>
        )}

        <section aria-labelledby="answers-title" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="answers-title" className="text-lg font-semibold">
              Your application
            </h2>
            {v.editable && (
              <Link
                href={`/applications/${token}/edit`}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                {COPY.editButton}
              </Link>
            )}
          </div>
          {!v.editable && app.state === "active" && (
            <p className="text-sm text-muted-foreground">{COPY.editLocked}</p>
          )}
          <dl className="space-y-3 rounded-xl border bg-card p-4 text-sm">
            {(v.form?.fields ?? [])
              .filter((f) => flat[f.id] || filesByField.has(f.id))
              .map((f) => (
                <div key={f.id}>
                  <dt className="text-xs text-muted-foreground">{f.label}</dt>
                  <dd className="break-words whitespace-pre-line">
                    {f.type === "file" ? (filesByField.get(f.id) ?? []).join(", ") : flat[f.id]}
                  </dd>
                </div>
              ))}
          </dl>
        </section>

        {app.state === "active" && v.opportunity.settings.accommodations !== false && (
          <section aria-labelledby="adjust-title" className="space-y-2 print:hidden">
            <h2 id="adjust-title" className="text-lg font-semibold">
              Adjustments
            </h2>
            <AdjustmentsForm token={token} initial={v.accommodations ?? ""} />
          </section>
        )}

        {app.state === "active" && (
          <section aria-labelledby="messages-title" className="space-y-1 print:hidden">
            <h2 id="messages-title" className="text-lg font-semibold">
              Questions
            </h2>
            <p className="text-sm text-muted-foreground">
              Reply to any of our emails and the program team will get back to you
              {v.opportunity.settings.replyTo ? (
                <>
                  , or write to{" "}
                  <a
                    href={`mailto:${v.opportunity.settings.replyTo}`}
                    className="text-primary underline underline-offset-2"
                  >
                    {v.opportunity.settings.replyTo}
                  </a>
                </>
              ) : null}
              .
            </p>
          </section>
        )}

        <section aria-labelledby="data-title" className="space-y-2 print:hidden">
          <h2 id="data-title" className="text-lg font-semibold">
            Your data
          </h2>
          <p className="text-sm text-muted-foreground">
            Download everything you sent us, or ask us to delete your application.
          </p>
          <div className="flex flex-wrap gap-2">
            <a
              href={`/applications/${token}/data`}
              download
              className={buttonVariants({ variant: "outline" })}
            >
              <DownloadIcon data-icon="inline-start" aria-hidden />
              Download my data
            </a>
            {!v.request && <DeleteButton token={token} />}
          </div>
        </section>

        {app.state === "active" && (
          <section aria-labelledby="withdraw-title" className="space-y-2 print:hidden">
            <h2 id="withdraw-title" className="text-lg font-semibold">
              Withdraw
            </h2>
            <p className="text-sm text-muted-foreground">
              If you no longer want to be considered, you can withdraw at any time.
            </p>
            <WithdrawButton token={token} />
          </section>
        )}
      </div>
    </PublicContainer>
  );
}

export default function StatusPageBoundary(props: PageProps<"/applications/[token]">) {
  return (
    <Suspense fallback={<PublicSkeleton width="max-w-[640px]" />}>
      <StatusPage {...props} />
    </Suspense>
  );
}
