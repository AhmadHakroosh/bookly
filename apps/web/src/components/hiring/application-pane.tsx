import {
  AlertTriangleIcon,
  CalendarIcon,
  CircleHelpIcon,
  ClipboardCheckIcon,
  ExternalLinkIcon,
  FileTextIcon,
  LockIcon,
  ScaleIcon,
  UserIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { flattenAnswers, labelAnswers } from "@bookly/forms";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { PaneHeader } from "@/components/ui/pane-header";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Actor } from "@/server/access";
import { applicationDetail } from "@/server/hiring/pipeline";
import { initials } from "@/server/hiring/pipeline-text";
import { AccommodationsReveal, ClearFlag, StageMenu } from "./pane-controls";
import { StageChip } from "./stage-chip";

/*
 * The candidate pane (hiring.png, concept-fidelity.md §5): beside the board, for `?application=`.
 * What it shows follows the actor's role (ADR 0005, hiring README): coordinators see everything
 * the team does plus review progress, exit checks and whether adjustments were asked for;
 * reviewers and viewers see the application, its answers and documents. Reviews and decisions fill the Feedback tab and Decision status as H4 and H6 ship.
 */

const OUTCOME: Record<string, string> = {
  advance: "Advance",
  hold: "On hold",
  waitlist: "Waitlist",
  reject: "Not selected",
  offer: "Offered",
  admit: "Admit",
  hire: "Hire",
};

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof UserIcon;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2 rounded-xl border bg-card p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <Icon className="size-4 text-muted-foreground" aria-hidden />
        {title}
      </h3>
      {children}
    </section>
  );
}

export async function ApplicationPane({
  actor,
  applicationId,
}: {
  actor: Actor;
  applicationId: string;
}) {
  const d = await applicationDetail(actor, applicationId);
  if (!d)
    return (
      <div className="p-5">
        <h2 className="text-lg font-semibold">Application not found</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          It may have been withdrawn or deleted, or it isn&apos;t shared with you.
        </p>
      </div>
    );
  const app = d.application;
  const tz = d.opportunity.timezone ?? "UTC";
  const day = (x: Date) =>
    new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: tz }).format(x);
  const when = (x: Date, y?: Date) => {
    const f = new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      timeZone: tz,
    }).format(x);
    const t = (v: Date) =>
      new Intl.DateTimeFormat("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
        timeZone: tz,
      }).format(v);
    return `${f} · ${t(x)}${y ? ` – ${t(y)}` : ""}`;
  };
  const coordinator = d.role === "coordinator";
  const name = d.contact.name || d.contact.email || "Applicant";
  const fileFields = new Set(
    d.form?.fields.filter((f) => f.type === "file").map((f) => f.id) ?? [],
  );
  const answers = d.form
    ? Object.entries(
        labelAnswers(
          { ...d.form, fields: d.form.fields.filter((f) => !fileFields.has(f.id)) },
          flattenAnswers(d.form, d.answers),
        ),
      )
    : [];
  const next = d.interviews[0];
  const expected = Math.max(d.reviewsExpected, d.reviews.total);

  return (
    <div className="space-y-5 p-5">
      <PaneHeader
        media={
          <Avatar size="xl">
            <AvatarFallback>{initials(d.contact.name, d.contact.email ?? "")}</AvatarFallback>
          </Avatar>
        }
        title={name}
        subtitle={
          <>
            Application · {d.opportunity.title}
            {d.contact.email && <span className="block truncate">{d.contact.email}</span>}
          </>
        }
        status={
          coordinator && app.state === "active" && d.stage?.category === "open" ? (
            <StageMenu
              opportunityId={d.opportunity.id}
              applicationId={app.id}
              current={d.stage}
              stages={d.stages}
            />
          ) : d.stage ? (
            <StageChip name={d.stage.name} category={d.stage.category} withCategory />
          ) : null
        }
      />

      <Tabs defaultValue="overview">
        <TabsList variant="line" className="w-full justify-start">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="interviews">Interviews</TabsTrigger>
          <TabsTrigger value="feedback">Feedback</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-3 pt-3">
          {app.flags.length > 0 && (
            <Section icon={AlertTriangleIcon} title="Requirements">
              <ul className="space-y-1.5">
                {app.flags.map((f, i) => (
                  <li
                    key={`${f.requirement}-${i}`}
                    className="flex items-center justify-between gap-2 text-sm"
                  >
                    <span className="font-medium text-brand">
                      Doesn&apos;t meet: {f.requirement}
                    </span>
                    {coordinator && (
                      <ClearFlag applicationId={app.id} requirement={f.requirement} />
                    )}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">
                A flag never rejects anyone. A person decides what happens next.
              </p>
            </Section>
          )}

          <Section icon={UserIcon} title="About">
            {answers.length ? (
              <dl className="space-y-2 text-sm">
                {answers.map(([q, v]) => (
                  <div key={q}>
                    <dt className="text-xs text-muted-foreground">{q}</dt>
                    <dd className="break-words whitespace-pre-wrap">{v}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">No answers to show.</p>
            )}
            <p className="flex items-center gap-2 pt-1 text-sm text-muted-foreground">
              <CalendarIcon className="size-4" aria-hidden />
              {app.submittedAt ? `Application submitted ${day(app.submittedAt)}` : "Not submitted"}
            </p>
            {d.editedAt && (
              <p className="text-xs text-muted-foreground">
                Edited after submission on {day(d.editedAt)}
              </p>
            )}
          </Section>

          {d.files.length > 0 && (
            <Section icon={FileTextIcon} title="Documents">
              <ul className="space-y-1.5">
                {d.files.map((f) => (
                  <li key={f.id}>
                    <a
                      href={`/files/${f.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 text-sm font-medium text-brand hover:underline"
                    >
                      <FileTextIcon className="size-4" aria-hidden />
                      {f.name}
                      <ExternalLinkIcon className="size-3.5" aria-hidden />
                      <span className="sr-only">(opens in a new tab)</span>
                    </a>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <Section icon={CalendarIcon} title="Next interview">
              {next ? (
                <>
                  <p className="font-medium">{next.title ?? "Interview"}</p>
                  <p className="text-sm text-muted-foreground">{when(next.startAt, next.endAt)}</p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Nothing booked yet.</p>
              )}
            </Section>
            {(expected > 0 || d.reviews.mine) && (
              <Section icon={ClipboardCheckIcon} title="Structured review progress">
                {coordinator ? (
                  <>
                    <p className="font-medium">
                      {d.reviews.submitted} of {expected} submitted
                    </p>
                    <Progress
                      value={expected ? (d.reviews.submitted / expected) * 100 : 0}
                      label="Reviews submitted"
                      hideLabel
                      valueText={`${d.reviews.submitted} of ${expected}`}
                    />
                  </>
                ) : (
                  <p className="font-medium">
                    {d.reviews.mine === "submitted" ? "Your review is in" : "Your review is due"}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  Independent feedback hidden until submission.
                </p>
              </Section>
            )}
          </div>

          {coordinator && d.checks.length > 0 && (
            <p className="flex items-start gap-2 rounded-lg bg-muted/60 px-3 py-2 text-sm">
              <AlertTriangleIcon className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
              <span>
                Before moving on: {d.checks.map((c) => c.text).join(", ")}. You can still move this
                application; it&apos;s recorded.
              </span>
            </p>
          )}

          {coordinator && (
            <Section icon={ScaleIcon} title="Decision status">
              {d.decision && d.decision.status !== "withdrawn" ? (
                <p className="font-medium">
                  {OUTCOME[d.decision.outcome] ?? d.decision.outcome}
                  {d.decision.decidedAt && (
                    <span className="font-normal text-muted-foreground">
                      {" "}
                      · {day(d.decision.decidedAt)}
                    </span>
                  )}
                </p>
              ) : (
                <>
                  <p className="font-medium">No decision yet</p>
                  <p className="text-xs text-muted-foreground">
                    Decisions are recorded by coordinators, never by moving a card.
                  </p>
                </>
              )}
            </Section>
          )}

          {d.hasAccommodations && (
            <Section icon={LockIcon} title="Adjustments requested">
              <p className="text-xs text-muted-foreground">
                Restricted: only coordinators can read this, and only to arrange the process.
              </p>
              <AccommodationsReveal applicationId={app.id} />
            </Section>
          )}
        </TabsContent>

        <TabsContent value="interviews" className="space-y-3 pt-3">
          {d.interviews.length ? (
            <ul className="divide-y rounded-xl border bg-card">
              {d.interviews.map((i) => (
                <li key={i.id} className="px-4 py-3 text-sm">
                  <p className="font-medium">{i.title ?? "Interview"}</p>
                  <p className="text-muted-foreground">{when(i.startAt, i.endAt)}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-xl border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
              No upcoming interviews.
            </p>
          )}
        </TabsContent>

        <TabsContent value="feedback" className="space-y-3 pt-3">
          <p className="rounded-xl border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
            {coordinator && expected
              ? `${d.reviews.submitted} of ${expected} reviews submitted. Reviews appear here once they're in.`
              : "Reviews appear here once reviewers submit them."}
          </p>
        </TabsContent>
      </Tabs>

      <p className="flex items-center gap-2 rounded-lg border px-3 py-2 text-xs text-muted-foreground">
        <LockIcon className="size-3.5" aria-hidden />
        Access limited to assigned reviewers
        <a
          href="/docs/hiring#who-sees-what"
          target="_blank"
          rel="noreferrer"
          className="ms-auto inline-flex"
          aria-label="Who can see applications (opens in a new tab)"
        >
          <CircleHelpIcon className="size-4" aria-hidden />
        </a>
      </p>
    </div>
  );
}
