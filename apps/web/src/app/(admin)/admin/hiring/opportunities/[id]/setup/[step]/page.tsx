import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { CheckIcon, CircleAlertIcon } from "lucide-react";
import { and, eq, inArray, isNull, or, schema } from "@bookly/db";
import { BetaBadge } from "@/components/beta-badge";
import { ApplicantPreview, type PreviewData } from "@/components/hiring/applicant-preview";
import { BasicsForm } from "@/components/hiring/basics-form";
import { DataRequests } from "@/components/hiring/data-requests";
import { PrivacyForm } from "@/components/hiring/privacy-form";
import { PublishButton } from "@/components/hiring/publish-button";
import { StageEditor, type EditorData } from "@/components/hiring/stage-editor";
import { StepRail } from "@/components/hiring/step-rail";
import { TeamStep } from "@/components/hiring/team-step";
import { OpportunitySetupSkeleton } from "@/components/skeletons/pages";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { StatusChip } from "@/components/ui/status-chip";
import { db } from "@/lib/db";
import { timezoneList, utcToZoned } from "@/lib/time";
import { retentionWarning } from "@/server/hiring/hiring-text";
import { listDataRequests, previewToken } from "@/server/hiring/apply";
import { daysUntil } from "@/server/hiring/apply-text";
import { loadSetup, TYPE_LABELS, type Setup } from "@/server/hiring/setup";
import {
  journey,
  journeySummary,
  opportunityStatus,
  privacyNoticeTemplate,
  SETUP_STEPS,
  STEP_LABELS,
  stepStatus,
  type ChecklistItem,
  type SetupStep,
} from "@/server/hiring/setup-text";
import { workspaceLimits } from "@/server/limits";
import { isManager } from "@/server/session";
import { publicBaseUrl } from "@/server/urls";
import { hiringContext, opportunityPath, setupPath } from "../../../../context";

export const metadata = { title: "Opportunity setup" };

type Ctx = NonNullable<Awaited<ReturnType<typeof hiringContext>>>;

const isStep = (s: string): s is SetupStep => (SETUP_STEPS as readonly string[]).includes(s);

/** Where a checklist item or a problem is fixed: its step, its stage and its module. */
const fixHref = (id: string, i: Pick<ChecklistItem, "step" | "stageKey" | "module">) =>
  setupPath(
    id,
    i.step,
    new URLSearchParams({
      ...(i.stageKey ? { stage: i.stageKey } : {}),
      ...(i.module ? { module: i.module } : {}),
    }).toString(),
  );

function previewOf(setup: Setup, base?: string): PreviewData {
  const b = setup.basics;
  return {
    title: b.title === "Untitled opportunity" ? "" : b.title,
    cohortName: b.cohortName,
    closesAt: b.closesAt?.toISOString() ?? null,
    decidesBy: b.decidesBy?.toISOString() ?? null,
    timezone: b.timezone,
    fields: (setup.form?.fields ?? []).map((f) => ({
      id: f.id,
      label: f.label,
      type: f.type,
      required: !!f.required,
    })),
    notice: setup.opportunity.settings.privacyNotice?.text ?? "",
    accommodations: setup.opportunity.settings.accommodations ?? true,
    journey: journey(setup.stages, b),
    ...(base
      ? {
          fullPreviewUrl: `${base}/apply/${setup.opportunity.slug}${setup.opportunity.status === "draft" ? `?preview=${previewToken(setup.opportunity.id)}` : ""}`,
        }
      : {}),
  };
}

async function SetupPage({
  params,
  searchParams,
}: PageProps<"/admin/hiring/opportunities/[id]/setup/[step]">) {
  const c = await hiringContext();
  if (!c) redirect("/admin");
  const [{ id, step }, sp] = await Promise.all([params, searchParams]);
  if (!isStep(step)) notFound();
  const setup = await loadSetup(c.actor, c.ws, id);
  if (!setup) notFound();
  const opp = setup.opportunity;
  const draft = opp.status === "draft";
  const s = opportunityStatus(opp.status, setup.basics.opensAt);
  const header = (
    <PageHeader
      title={draft ? "Create opportunity" : "Edit setup"}
      badge={c.beta && <BetaBadge />}
      description={
        <span className="flex flex-wrap items-center gap-2">
          {opp.title}
          <StatusChip tone={s.tone} dot>
            {s.label}
          </StatusChip>
        </span>
      }
      actions={
        !draft && (
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href={opportunityPath(id)} />}
          >
            Back to the opportunity
          </Button>
        )
      }
    />
  );
  if (!setup.canConfigure)
    return (
      <div className="space-y-6">
        {header}
        <p className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">
          Only coordinators can change this opportunity&apos;s setup.
        </p>
      </div>
    );
  const at = SETUP_STEPS.indexOf(step);
  const next = SETUP_STEPS[at + 1];
  const prev = SETUP_STEPS[at - 1];
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
  return (
    <div className="space-y-6">
      {header}
      <div
        className={
          step === "stages"
            ? "space-y-6"
            : "grid grid-cols-1 gap-6 lg:grid-cols-[12rem_minmax(0,1fr)]"
        }
      >
        <StepRail
          row={step === "stages"}
          current={step}
          status={stepStatus(setup.checklist, setup.basics)}
          href={(x) => setupPath(id, x)}
        />
        <section aria-labelledby="step-title" className="min-w-0 space-y-4">
          <h2 id="step-title" className="text-lg font-semibold">
            {step === "stages"
              ? "Stages"
              : step === "privacy"
                ? "Privacy and applicant experience"
                : step === "publish"
                  ? "Ready to publish?"
                  : step === "team"
                    ? "Team and access"
                    : STEP_LABELS[step]}
          </h2>
          {step === "basics" && (
            <BasicsStep ctx={c} setup={setup} copied={one(sp.copied) === "1"} />
          )}
          {step === "stages" && (
            <StagesStep ctx={c} setup={setup} stage={one(sp.stage)} module={one(sp.module)} />
          )}
          {step === "team" && <TeamStepPage ctx={c} setup={setup} />}
          {step === "privacy" && <PrivacyStep ctx={c} setup={setup} />}
          {step === "publish" && <PublishStep setup={setup} base={await publicBaseUrl(c.ws)} />}
          {(step === "stages" || step === "team") && (
            <div className="flex justify-between gap-2 border-t pt-4">
              {prev ? (
                <Button
                  variant="ghost"
                  nativeButton={false}
                  render={<Link href={setupPath(id, prev)} />}
                >
                  Back
                </Button>
              ) : (
                <span />
              )}
              {next && (
                <Button
                  variant="ink"
                  nativeButton={false}
                  render={<Link href={setupPath(id, next)} />}
                >
                  Continue
                </Button>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

/* ---------------- Steps ---------------- */

async function BasicsStep({ ctx, setup, copied }: { ctx: Ctx; setup: Setup; copied: boolean }) {
  const b = setup.basics;
  const local = (d: Date | null) => (d ? utcToZoned(d, b.timezone) : null);
  const time = (d: Date | null) => {
    const z = local(d);
    return z
      ? `${String(Math.floor(z.minutes / 60)).padStart(2, "0")}:${String(z.minutes % 60).padStart(2, "0")}`
      : "";
  };
  const types = Object.entries(TYPE_LABELS).map(([value, label]) => ({ value, label: label! }));
  if (!types.some((t) => t.value === b.type)) types.push({ value: b.type, label: b.type });
  return (
    <>
      {copied && (
        <p
          role="status"
          className="rounded-lg border border-info/40 bg-info-muted px-4 py-3 text-sm"
        >
          Set the dates for this cycle.
        </p>
      )}
      <BasicsForm
        id={setup.opportunity.id}
        untitled={b.title === "Untitled opportunity"}
        initial={{
          title: b.title,
          cohortName: b.cohortName ?? "",
          type: b.type,
          opensDate: local(b.opensAt)?.date ?? "",
          opensTime: time(b.opensAt),
          closesDate: local(b.closesAt)?.date ?? "",
          closesTime: time(b.closesAt),
          decidesDate: local(b.decidesBy)?.date ?? "",
          capacity: b.capacity,
          timezone: b.timezone,
          slug: b.slug,
        }}
        types={types}
        zones={timezoneList()}
        linkBase={`${(await publicBaseUrl(ctx.ws)).replace(/^https?:\/\//, "")}/apply/`}
      />
    </>
  );
}

async function StagesStep({
  ctx,
  setup,
  stage,
  module,
}: {
  ctx: Ctx;
  setup: Setup;
  stage?: string;
  module?: string;
}) {
  const wsId = ctx.ws.id;
  const referenced = setup.stages.flatMap((s) => s.modules.forms?.forms.map((f) => f.formId) ?? []);
  const [eventTypes, scorecards, forms] = await Promise.all([
    db()
      .select({
        id: schema.eventTypes.id,
        title: schema.eventTypes.title,
        minutes: schema.eventTypes.durationMin,
      })
      .from(schema.eventTypes)
      .where(and(eq(schema.eventTypes.workspaceId, wsId), eq(schema.eventTypes.active, true))),
    db()
      .select({
        id: schema.scorecards.id,
        name: schema.scorecards.name,
        criteria: schema.scorecards.criteria,
      })
      .from(schema.scorecards)
      .where(and(eq(schema.scorecards.workspaceId, wsId), isNull(schema.scorecards.archivedAt))),
    db()
      .select({ id: schema.forms.id, name: schema.forms.name, purpose: schema.forms.purpose })
      .from(schema.forms)
      .where(
        and(
          eq(schema.forms.workspaceId, wsId),
          isNull(schema.forms.archivedAt),
          or(
            referenced.length ? inArray(schema.forms.id, referenced) : undefined,
            and(
              inArray(schema.forms.purpose, ["stage", "reference"]),
              eq(schema.forms.shared, true),
            ),
          ),
        ),
      ),
  ]);
  const data: EditorData = {
    oppId: setup.opportunity.id,
    stages: setup.stages,
    formId: setup.opportunity.formId,
    formFields: (setup.form?.fields ?? []).map((f) => ({ id: f.id, label: f.label, type: f.type })),
    eventTypes: eventTypes.map((e) => ({ value: e.id, label: `${e.title} (${e.minutes} min)` })),
    scorecards: scorecards.map((s) => ({ id: s.id, name: s.name, criteria: s.criteria.length })),
    forms,
    readOnly: false,
    problems: setup.problems,
    preview: previewOf(setup, await publicBaseUrl(ctx.ws)),
    initialStage: stage,
    initialModule: module,
  };
  return (
    <>
      <p className="text-sm text-muted-foreground">
        The steps an application moves through, in order. Choose what each step does.
        {setup.stages.length <= 3 && " Add the stages your process uses, in order."}
      </p>
      {/* A link to a stage or module (the checklist's) opens it, whatever was open before. */}
      <StageEditor key={`${stage ?? ""}:${module ?? ""}`} data={data} />
    </>
  );
}

async function TeamStepPage({ ctx, setup }: { ctx: Ctx; setup: Setup }) {
  const people = await db()
    .select({
      userId: schema.users.id,
      name: schema.users.name,
      email: schema.users.email,
      role: schema.members.role,
    })
    .from(schema.members)
    .innerJoin(schema.users, eq(schema.users.id, schema.members.userId))
    .where(eq(schema.members.organizationId, ctx.ws.organizationId));
  const roleOf = new Map(people.map((p) => [p.userId, p.role]));
  const limit = workspaceLimits(ctx.ws).collaborators;
  const collaborators = people.filter((p) => p.role === "collaborator").length;
  return (
    <TeamStep
      oppId={setup.opportunity.id}
      title={setup.opportunity.title}
      status={setup.opportunity.status}
      team={setup.team.map((t) => ({
        ...t,
        seat: roleOf.get(t.userId) === "collaborator" ? "collaborator" : "member",
      }))}
      invites={setup.invites.map((i) => ({
        id: i.id,
        email: i.email,
        role: i.role,
        sent: !!i.sentAt,
      }))}
      workspace={people.map((p) => ({
        userId: p.userId,
        name: p.name,
        email: p.email,
        collaborator: p.role === "collaborator",
      }))}
      canInvite={isManager(ctx.actor.workspaceRole)}
      seatLine={limit === null ? null : `Collaborators: ${collaborators} of ${limit} included`}
      readOnly={false}
    />
  );
}

async function PrivacyStep({ ctx, setup }: { ctx: Ctx; setup: Setup }) {
  const s = setup.opportunity.settings;
  const tz = setup.basics.timezone;
  const requests = setup.opportunity.publishedAt
    ? await listDataRequests(ctx.actor, setup.opportunity.id)
    : [];
  const day = (d: Date) =>
    new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: tz }).format(d);
  return (
    <div className="space-y-8">
      <PrivacyForm
        oppId={setup.opportunity.id}
        initial={{
          notice: s.privacyNotice?.text ?? "",
          retentionDays: setup.retention,
          accommodations: s.accommodations ?? true,
          senderName: s.senderName ?? "",
          replyTo: s.replyTo ?? "",
        }}
        template={privacyNoticeTemplate(ctx.ws.name, setup.retention)}
        employment={!!retentionWarning(setup.opportunity.type, 0)}
        readOnly={false}
      />
      {setup.opportunity.publishedAt && (
        <section aria-labelledby="requests-title" className="space-y-3">
          <h3 id="requests-title" className="text-base font-semibold">
            Data requests
          </h3>
          <p className="text-sm text-muted-foreground">
            Applicants can ask for their application to be deleted. You have 30 days; after that,
            Bookly deletes it unless you record a legal hold.
          </p>
          <DataRequests
            rows={requests.map((r) => ({
              id: r.id,
              email: r.contactEmail,
              requested: day(r.requestedAt),
              daysLeft: daysUntil(r.dueAt),
              deletesOn: day(r.dueAt),
              held: r.status === "held" ? (r.holdReason ?? "") : null,
            }))}
          />
        </section>
      )}
    </div>
  );
}

function PublishStep({ setup, base }: { setup: Setup; base: string }) {
  const id = setup.opportunity.id;
  const failing = setup.checklist.filter((i) => !i.ok);
  const preview = previewOf(setup, base);
  const draft = setup.opportunity.status === "draft";
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
      <div className="space-y-4">
        <ul className="divide-y rounded-xl border bg-card">
          {setup.checklist.map((i) => (
            <li key={i.id} className="flex items-start gap-3 px-4 py-3 text-sm">
              {i.ok ? (
                <CheckIcon className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
              ) : (
                <CircleAlertIcon className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
              )}
              <div className="min-w-0">
                <p className={i.ok ? undefined : "font-medium"}>
                  <span className="sr-only">{i.ok ? "Done: " : "To fix: "}</span>
                  {i.label}
                </p>
                {!i.ok && (
                  <Link
                    href={fixHref(id, i)}
                    className="text-xs text-primary underline underline-offset-2"
                  >
                    {i.detail}
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
        <p className="text-sm text-muted-foreground">{journeySummary(preview.journey)}</p>
        {draft ? (
          <PublishButton
            oppId={id}
            failing={failing.length}
            reasons={Object.fromEntries(setup.checklist.map((i) => [i.id, i.detail ?? i.label]))}
          />
        ) : (
          <p className="rounded-lg bg-muted/60 px-4 py-3 text-sm">
            Published. Changes you save here are live at once and recorded in the activity log.
          </p>
        )}
      </div>
      <aside aria-label="Applicant preview" className="rounded-xl border bg-card p-4">
        <ApplicantPreview data={preview} stageKey={setup.stages[0]?.key ?? ""} />
      </aside>
    </div>
  );
}

export default function SetupPageBoundary(
  props: PageProps<"/admin/hiring/opportunities/[id]/setup/[step]">,
) {
  return (
    <Suspense fallback={<OpportunitySetupSkeleton />}>
      <SetupPage {...props} />
    </Suspense>
  );
}
