import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import {
  AlertTriangleIcon,
  CalendarIcon,
  ClipboardCheckIcon,
  ClockIcon,
  ExternalLinkIcon,
  InboxIcon,
  PencilIcon,
} from "lucide-react";
import { eq, schema } from "@bookly/db";
import { BetaBadge } from "@/components/beta-badge";
import { ApplicationPane } from "@/components/hiring/application-pane";
import { OpportunityMenu, PublishedToast } from "@/components/hiring/opportunity-menu";
import { PipelineBoard, type PipelineCard } from "@/components/hiring/pipeline-board";
import { FILTERS, type Filter } from "@/components/hiring/pipeline-filters";
import { PaneHost } from "@/components/pane";
import { TeamStep } from "@/components/hiring/team-step";
import { OpportunitySkeleton } from "@/components/skeletons/pages";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { AttentionItem, AttentionStrip } from "@/components/ui/attention-strip";
import { PageTabs } from "@/components/ui/page-tabs";
import { PageHeader } from "@/components/ui/page-header";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { StatusChip } from "@/components/ui/status-chip";
import { db } from "@/lib/db";
import { draftCount, previewToken } from "@/server/hiring/apply";
import type { Actor } from "@/server/access";
import { boardData } from "@/server/hiring/pipeline";
import { cardLine, initials } from "@/server/hiring/pipeline-text";
import { opportunityCounts } from "@/server/hiring/queries";
import { publicBaseUrl } from "@/server/urls";
import { loadSetup, type Setup } from "@/server/hiring/setup";
import { opportunityMeta, opportunityStatus, ROLE_LABELS } from "@/server/hiring/setup-text";
import { hiringContext, opportunityPath, setupPath } from "../../context";

export const metadata = { title: "Opportunity" };

const TABS = [
  { id: "pipeline", label: "Pipeline" },
  { id: "interviews", label: "Interviews" },
  { id: "review-plan", label: "Review plan" },
  { id: "team", label: "Team" },
] as const;
type Tab = (typeof TABS)[number]["id"];

/**
 * One opportunity (hiring.png): its title with the status chip and the cohort and dates under
 * it, then Pipeline · Interviews · Review plan · Team with the counts on the right. Candidates,
 * interviews and reviews fill these as the later hiring slices ship; the setup is already here.
 */
async function OpportunityPage({
  params,
  searchParams,
}: PageProps<"/admin/hiring/opportunities/[id]">) {
  const c = await hiringContext();
  if (!c) redirect("/admin");
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const setup = await loadSetup(c.actor, c.ws, id);
  if (!setup) notFound();
  const opp = setup.opportunity;
  const tab: Tab = TABS.some((t) => t.id === sp.tab) ? (sp.tab as Tab) : "pipeline";
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const view = one(sp.view) === "list" ? "list" : "board";
  const filter = (FILTERS.find((f) => f.id === one(sp.filter))?.id ?? "all") as Filter;
  const applicationId = one(sp.application) ?? null;
  const [counts, drafts, base] = await Promise.all([
    opportunityCounts(c.actor, id),
    draftCount(c.actor, id),
    publicBaseUrl(c.ws),
  ]);
  const b = setup.basics;
  const s = opportunityStatus(opp.status, b.opensAt);
  const fmt = (d: Date) =>
    new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: b.timezone,
    }).format(d);
  const published =
    sp.published === "scheduled" && b.opensAt
      ? `${opp.title} opens on ${fmt(b.opensAt)} (${b.timezone}). The application page shows an "Opens soon" notice until then.`
      : sp.published
        ? `${opp.title} is open. Share the application page to start receiving applications.`
        : null;
  const n = (k: number, w: string) => `${k} ${w}${k === 1 ? "" : "s"}`;
  return (
    <div className="space-y-6">
      <PublishedToast message={published} link={`${base}/apply/${opp.slug}`} />
      <PageHeader
        title={opp.title}
        badge={
          <>
            <StatusChip tone={s.tone} dot>
              {s.label}
            </StatusChip>
            {c.beta && <BetaBadge />}
          </>
        }
        description={opportunityMeta({ ...b, cohort: b.cohortName }, b.timezone)}
        actions={
          setup.canConfigure && (
            <>
              {/* hiring.png's outline action: the live page, or the full preview of a draft. */}
              <a
                href={`${base}/apply/${opp.slug}${opp.status === "draft" ? `?preview=${previewToken(opp.id)}` : ""}`}
                target="_blank"
                rel="noreferrer"
                className={buttonVariants({ variant: "outline" })}
              >
                {opp.status === "draft" ? "Open full preview" : "View application page"}
                <ExternalLinkIcon data-icon="inline-end" aria-hidden />
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
              {opp.status === "draft" ? (
                <Button
                  variant="ink"
                  nativeButton={false}
                  render={<Link href={setupPath(id, "basics")} />}
                >
                  Continue setup
                </Button>
              ) : (
                <Button
                  variant="outline"
                  nativeButton={false}
                  render={<Link href={setupPath(id, "stages")} />}
                >
                  <PencilIcon data-icon="inline-start" />
                  Edit setup
                </Button>
              )}
              <OpportunityMenu
                id={id}
                title={opp.title}
                status={opp.status}
                canConfigure={setup.canConfigure}
              />
            </>
          )
        }
      >
        <PageTabs
          label="Opportunity"
          items={TABS.map((t) => ({
            href: t.id === "pipeline" ? opportunityPath(id) : opportunityPath(id, `?tab=${t.id}`),
            label: t.label,
            active: tab === t.id,
          }))}
          aside={[
            n(counts.applications, "application"),
            `${n(counts.interviews, "interview")} this week`,
            `${n(counts.reviews, "review")} pending`,
          ].join(" · ")}
        />
      </PageHeader>
      {tab === "pipeline" && (
        <Pipeline actor={c.actor} setup={setup} drafts={drafts} view={view} filter={filter} />
      )}
      {tab === "interviews" && <Interviews setup={setup} />}
      {tab === "review-plan" && <ReviewPlan setup={setup} />}
      {tab === "team" && <Team ctx={c} setup={setup} />}
      <PaneHost param="application" id={applicationId} label="Application">
        {applicationId && <ApplicationPane actor={c.actor} applicationId={applicationId} />}
      </PaneHost>
    </div>
  );
}

const ATTENTION_ICONS = {
  feedback: ClipboardCheckIcon,
  scheduling: CalendarIcon,
  flagged: AlertTriangleIcon,
  waiting: ClockIcon,
} as const;

async function Pipeline({
  actor,
  setup,
  drafts,
  view,
  filter,
}: {
  actor: Actor;
  setup: Setup;
  drafts: number;
  view: "board" | "list";
  filter: Filter;
}) {
  const id = setup.opportunity.id;
  const board = await boardData(actor, id);
  if (!board) notFound();
  const tz = setup.basics.timezone;
  const now = new Date();
  const day = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: tz });
  const limits = new Map(board.stages.map((s) => [s.id, s.attentionAfterDays]));
  const cards: PipelineCard[] = board.cards.map((c) => {
    const limit = c.stageId ? limits.get(c.stageId) : null;
    return {
      id: c.id,
      name: c.name || c.email,
      initials: initials(c.name, c.email),
      applied: c.submittedAt ? `Applied ${day.format(c.submittedAt)}` : "Not submitted",
      stageId: c.stageId,
      line: cardLine(c.facts, tz, now),
      is: {
        flagged: c.facts.flags.length > 0,
        feedback: c.facts.reviews.overdue > 0,
        scheduling: c.facts.awaitingScheduling,
        waiting:
          !!limit &&
          !!c.stageEnteredAt &&
          now.getTime() - c.stageEnteredAt.getTime() > limit * 86_400_000,
      },
    };
  });
  const tabs = [
    { href: opportunityPath(id), label: "Board", active: view === "board" },
    { href: opportunityPath(id, "?view=list"), label: "List", active: view === "list" },
  ];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SegmentedTabs items={tabs} label="Pipeline view" />
        {/* Drafts never reach the team: only how many there are. */}
        {drafts > 0 && (
          <p className="text-sm text-muted-foreground">{drafts} started, not submitted</p>
        )}
      </div>
      {cards.length === 0 && (
        <EmptyState
          size="sm"
          icon={InboxIcon}
          title={setup.opportunity.status === "draft" ? "Not published yet" : "No applications yet"}
          description={
            setup.opportunity.status === "draft"
              ? "Publish the opportunity to start receiving applications."
              : `Applications land in ${setup.stages[0]?.name ?? "the first stage"} as they arrive.`
          }
        />
      )}
      <PipelineBoard
        key={`${view}:${filter}`}
        opportunityId={id}
        stages={board.stages.map((s) => ({ id: s.id, name: s.name, category: s.category }))}
        cards={cards}
        canMove={board.role === "coordinator" && setup.opportunity.status !== "archived"}
        view={view}
        filter={filter}
      />
      {board.attention.length > 0 && (
        <AttentionStrip>
          {board.attention.map((a) => (
            <AttentionItem
              key={a.id}
              icon={ATTENTION_ICONS[a.id]}
              title={a.title}
              detail={a.detail}
              action={{
                label: "View candidates",
                href: opportunityPath(id, `?view=list&filter=${a.filter}`),
              }}
            />
          ))}
        </AttentionStrip>
      )}
    </div>
  );
}

async function Interviews({ setup }: { setup: Setup }) {
  const stages = setup.stages.filter(
    (s) => s.modules.scheduling && s.modules.scheduling.enabled !== false,
  );
  const ids = stages.flatMap((s) => s.modules.scheduling!.sessions.map((x) => x.eventTypeId));
  const names = new Map(
    ids.length
      ? (
          await db()
            .select({ id: schema.eventTypes.id, title: schema.eventTypes.title })
            .from(schema.eventTypes)
            .where(eq(schema.eventTypes.workspaceId, setup.opportunity.workspaceId))
        ).map((e) => [e.id, e.title])
      : [],
  );
  if (!stages.length)
    return (
      <EmptyState
        icon={CalendarIcon}
        title="No interview stages"
        description="Switch on Scheduling on a stage to send applicants a link to book an interview."
      />
    );
  return (
    <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {stages.map((s) => {
        const sc = s.modules.scheduling!;
        return (
          <li key={s.id} className="rounded-xl border bg-card p-4 sm:p-5">
            <p className="font-medium">{s.name}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {sc.sessions.length
                ? sc.sessions.map((x) => names.get(x.eventTypeId) ?? "An event type").join(", ")
                : "Choose an event type to send booking links."}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">No interviews booked yet.</p>
          </li>
        );
      })}
    </ul>
  );
}

function ReviewPlan({ setup }: { setup: Setup }) {
  const stages = setup.stages.filter(
    (s) => s.modules.reviews && s.modules.reviews.enabled !== false,
  );
  if (!stages.length)
    return (
      <EmptyState
        icon={ClipboardCheckIcon}
        title="No review stages"
        description="Switch on Reviews on a stage to give every application reviewers and a scorecard."
      />
    );
  return (
    <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {stages.map((s) => {
        const r = s.modules.reviews!;
        const card = setup.scorecards.find((x) => x.id === r.scorecardId);
        return (
          <li key={s.id} className="rounded-xl border bg-card p-4 sm:p-5">
            <p className="font-medium">{s.name}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {r.reviewersPerApplication} reviewer{r.reviewersPerApplication === 1 ? "" : "s"} per
              application
              {r.dueDays ? ` · due ${r.dueDays} days after entering` : ""}
            </p>
            {card ? (
              <>
                <p className="mt-3 text-xs font-medium">{card.name}</p>
                <ul className="mt-1 list-disc pl-5 text-sm">
                  {card.criteria.map((c) => (
                    <li key={c.id}>{c.label}</li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="mt-3 text-sm text-destructive">Choose a scorecard.</p>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              Independent feedback hidden until submission. Scores are shown as distributions, never
              averaged into a rank.
            </p>
          </li>
        );
      })}
    </ul>
  );
}

async function Team({
  ctx,
  setup,
}: {
  ctx: NonNullable<Awaited<ReturnType<typeof hiringContext>>>;
  setup: Setup;
}) {
  if (!setup.canConfigure)
    return (
      <ul className="divide-y rounded-xl border bg-card">
        {setup.team.map((m) => (
          <li key={m.userId} className="flex items-center justify-between px-4 py-3 text-sm">
            <span>{m.name}</span>
            <span className="text-muted-foreground">{ROLE_LABELS[m.role]}</span>
          </li>
        ))}
      </ul>
    );
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
      canInvite={ctx.actor.workspaceRole === "owner" || ctx.actor.workspaceRole === "admin"}
      seatLine={null}
      readOnly={false}
    />
  );
}

export default function OpportunityPageBoundary(
  props: PageProps<"/admin/hiring/opportunities/[id]">,
) {
  return (
    <Suspense fallback={<OpportunitySkeleton />}>
      <OpportunityPage {...props} />
    </Suspense>
  );
}
