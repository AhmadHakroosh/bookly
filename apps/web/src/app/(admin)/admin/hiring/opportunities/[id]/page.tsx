import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { CalendarIcon, ClipboardCheckIcon, InboxIcon, PencilIcon } from "lucide-react";
import { cn } from "cn";
import { eq, schema } from "@bookly/db";
import { BetaBadge } from "@/components/beta-badge";
import { OpportunityMenu, PublishedToast } from "@/components/hiring/opportunity-menu";
import { StageChip } from "@/components/hiring/stage-chip";
import { TeamStep } from "@/components/hiring/team-step";
import { OpportunitySkeleton } from "@/components/skeletons/pages";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { KanbanBoard, KanbanColumn, KanbanList } from "@/components/ui/kanban";
import { PageHeader } from "@/components/ui/page-header";
import { StatusChip } from "@/components/ui/status-chip";
import { db } from "@/lib/db";
import { opportunityCounts, stageTotals } from "@/server/hiring/queries";
import { loadSetup, type Setup } from "@/server/hiring/setup";
import {
  candidateLabel,
  isFinal,
  opportunityMeta,
  opportunityStatus,
  ROLE_LABELS,
} from "@/server/hiring/setup-text";
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
  const [counts, totals] = await Promise.all([
    opportunityCounts(c.actor, id),
    stageTotals(c.actor, id),
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
        ? `${opp.title} is open. Its application page goes live with the next hiring beta release.`
        : null;
  const n = (k: number, w: string) => `${k} ${w}${k === 1 ? "" : "s"}`;
  return (
    <div className="space-y-6">
      <PublishedToast message={published} />
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
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 border-b">
          <nav aria-label="Opportunity" className="-mb-px flex gap-1 overflow-x-auto">
            {TABS.map((t) => (
              <Link
                key={t.id}
                href={
                  t.id === "pipeline" ? opportunityPath(id) : opportunityPath(id, `?tab=${t.id}`)
                }
                aria-current={tab === t.id ? "page" : undefined}
                className={cn(
                  "border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap",
                  tab === t.id
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
              </Link>
            ))}
          </nav>
          <p className="pb-2 text-sm text-muted-foreground">
            {[
              n(counts.applications, "application"),
              `${n(counts.interviews, "interview")} this week`,
              `${n(counts.reviews, "review")} pending`,
            ].join(" · ")}
          </p>
        </div>
      </PageHeader>
      {tab === "pipeline" && <Pipeline setup={setup} totals={totals} />}
      {tab === "interviews" && <Interviews setup={setup} />}
      {tab === "review-plan" && <ReviewPlan setup={setup} />}
      {tab === "team" && <Team ctx={c} setup={setup} />}
    </div>
  );
}

function Pipeline({ setup, totals }: { setup: Setup; totals: Map<string, number> }) {
  const open = setup.stages.filter((s) => !isFinal(s.category));
  const outcomes = setup.stages.filter((s) => isFinal(s.category));
  const any = [...totals.values()].some(Boolean);
  return (
    <div className="space-y-4">
      {!any && (
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
      {/* The board scrolls sideways: reachable and named for keyboard and screen readers. */}
      <KanbanBoard
        tabIndex={0}
        role="region"
        aria-label="Pipeline by stage"
        className="rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {open.map((s) => (
          <KanbanColumn key={s.id} title={s.name} count={totals.get(s.id) ?? 0}>
            <KanbanList>
              <li className="px-2 py-6 text-center text-xs text-muted-foreground">
                Applicants see &ldquo;{candidateLabel(s)}&rdquo;
              </li>
            </KanbanList>
          </KanbanColumn>
        ))}
        <KanbanColumn
          title="Outcomes"
          count={outcomes.reduce((k, s) => k + (totals.get(s.id) ?? 0), 0)}
        >
          <KanbanList>
            {outcomes.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between gap-2 px-2 py-1.5 text-sm"
              >
                <StageChip name={s.name} category={s.category} withCategory />
                <span className="text-muted-foreground tabular-nums">{totals.get(s.id) ?? 0}</span>
              </li>
            ))}
          </KanbanList>
        </KanbanColumn>
      </KanbanBoard>
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
          <li key={s.id} className="rounded-xl border bg-card p-4">
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
          <li key={s.id} className="rounded-xl border bg-card p-4">
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
