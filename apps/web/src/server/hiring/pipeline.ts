import "server-only";
import { and, asc, eq, gt, inArray, isNull, ne, schema, sql } from "@bookly/db";
import type { Application, Opportunity, PipelineStage, Workspace } from "@bookly/db/schema";
import type { Answers, FormSchema } from "@bookly/forms";
import { db } from "@/lib/db";
import {
  applicationsVisibleTo,
  assertOnOpportunity,
  bookingsVisibleTo,
  HiringAccessError,
  roleOn,
  type Actor,
} from "../access";
import { audit, type AuditActor } from "../audit";
import { refreshWorkspace } from "../cache";
import { readModules, type StageModuleConfigs } from "../pipelines/modules";
import { scheduleTransitionRules, startRuns } from "../pipelines/rules";
import { emitEvent } from "../webhooks";
import {
  attention,
  exitChecks,
  leaveProblem,
  moveProblem,
  type CardFacts,
  type ExitCheck,
  type ReviewCounts,
} from "./pipeline-text";
import { hasAccommodations, readAccommodations } from "./sensitive";

/*
 * The hiring board (H3, hiring.png): what the team sees of an opportunity's applications, and
 * moving them between stages. Reads go through the access predicates (ADR 0005) in plain
 * selects; moves are for coordinators, check the stage's advisory exit checks (ADR 0002: "Move
 * anyway" is audited with the check), run the stages' rules, and fire
 * `application.stage_changed` with ids only. Outcomes are never reached by a move: a person
 * records a decision (H6).
 */

export class PipelineError extends Error {}

const a = schema.applications;

/** Live stages of an opportunity's pipeline, in order, with their modules read. */
async function stagesOf(opp: Pick<Opportunity, "pipelineId">) {
  const rows = await db()
    .select()
    .from(schema.pipelineStages)
    .where(
      and(
        eq(schema.pipelineStages.pipelineId, opp.pipelineId),
        isNull(schema.pipelineStages.archivedAt),
      ),
    )
    .orderBy(asc(schema.pipelineStages.position));
  return rows.map((s) => ({ ...s, read: readModules(s.modules).modules }));
}

async function opportunityFor(actor: Actor, id: string) {
  const [opp] = await db()
    .select()
    .from(schema.opportunities)
    .where(
      and(eq(schema.opportunities.id, id), eq(schema.opportunities.workspaceId, actor.workspaceId)),
    );
  return opp ?? null;
}

/** Review assignments on each application's current stage, as the card and the checks count them. */
async function reviewCounts(
  actor: Actor,
  apps: Pick<Application, "id" | "stageId">[],
  now = new Date(),
): Promise<Map<string, ReviewCounts>> {
  const out = new Map<string, ReviewCounts>(
    apps.map((x) => [x.id, { total: 0, submitted: 0, overdue: 0, mine: null }]),
  );
  if (!apps.length) return out;
  const rows = await db()
    .select({
      applicationId: schema.reviewAssignments.applicationId,
      stageId: schema.reviewAssignments.stageId,
      status: schema.reviewAssignments.status,
      dueAt: schema.reviewAssignments.dueAt,
      reviewer: schema.reviewAssignments.reviewerUserId,
    })
    .from(schema.reviewAssignments)
    .where(
      and(
        inArray(
          schema.reviewAssignments.applicationId,
          apps.map((x) => x.id),
        ),
        ne(schema.reviewAssignments.status, "declined"),
      ),
    );
  const stageOf = new Map(apps.map((x) => [x.id, x.stageId]));
  for (const r of rows) {
    if (stageOf.get(r.applicationId) !== r.stageId) continue;
    const c = out.get(r.applicationId)!;
    c.total++;
    if (r.status === "submitted") c.submitted++;
    else if (r.dueAt && r.dueAt < now) c.overdue++;
    if (r.reviewer === actor.userId) c.mine = r.status === "submitted" ? "submitted" : "pending";
  }
  return out;
}

/* ---------------- The board ---------------- */

export type BoardCard = {
  id: string;
  name: string;
  email: string;
  stageId: string | null;
  submittedAt: Date | null;
  stageEnteredAt: Date | null;
  tags: string[];
  facts: CardFacts;
};

/**
 * Every active application of an opportunity the actor may see, with what each card says next,
 * and the Needs attention strip. Viewers and reviewers see what the predicates allow; review
 * progress shows only to coordinators (reviewers see their own).
 */
export async function boardData(actor: Actor, opportunityId: string, now = new Date()) {
  if (!roleOn(actor, opportunityId)) return null;
  const opp = await opportunityFor(actor, opportunityId);
  if (!opp) return null;
  const coordinator = roleOn(actor, opportunityId) === "coordinator";
  const [stages, rows] = await Promise.all([
    stagesOf(opp),
    db()
      .select({
        app: a,
        name: schema.contacts.name,
        email: schema.contacts.email,
      })
      .from(a)
      .innerJoin(schema.contacts, eq(schema.contacts.id, a.contactId))
      .where(and(applicationsVisibleTo(actor), eq(a.opportunityId, opp.id), eq(a.state, "active")))
      .orderBy(asc(a.stageEnteredAt), asc(a.id)),
  ]);
  const apps = rows.map((r) => r.app);
  const ids = apps.map((x) => x.id);
  const [reviews, bookings] = await Promise.all([
    reviewCounts(actor, apps, now),
    ids.length
      ? db()
          .select({
            applicationId: schema.bookings.applicationId,
            stageId: schema.bookings.stageId,
            startAt: schema.bookings.startAt,
            status: schema.bookings.status,
          })
          .from(schema.bookings)
          .where(
            and(
              inArray(schema.bookings.applicationId, ids),
              bookingsVisibleTo(actor.userId),
              inArray(schema.bookings.status, ["confirmed", "pending"]),
            ),
          )
      : [],
  ]);
  const byId = new Map(stages.map((s) => [s.id, s]));
  const cards: BoardCard[] = rows.map(({ app, name, email }) => {
    const stage = app.stageId ? byId.get(app.stageId) : undefined;
    const mine = bookings.filter((b) => b.applicationId === app.id);
    const next = mine
      .filter((b) => b.startAt > now)
      .sort((x, y) => x.startAt.getTime() - y.startAt.getTime())[0];
    const scheduling = stage?.read.scheduling;
    const counts = reviews.get(app.id)!;
    return {
      id: app.id,
      name,
      email,
      stageId: app.stageId,
      submittedAt: app.submittedAt,
      stageEnteredAt: app.stageEnteredAt,
      tags: app.tags,
      facts: {
        flags: app.flags,
        reviews: coordinator ? counts : { total: 0, submitted: 0, overdue: 0, mine: counts.mine },
        interviewAt: next?.startAt ?? null,
        awaitingScheduling:
          !!scheduling &&
          scheduling.enabled !== false &&
          scheduling.sessions.length > 0 &&
          !mine.some((b) => b.stageId === app.stageId),
      },
    };
  });
  return {
    opportunity: opp,
    role: roleOn(actor, opportunityId)!,
    stages: stages.map((s) => ({
      id: s.id,
      key: s.key,
      name: s.name,
      category: s.category,
      isEntry: s.isEntry,
      color: s.color,
      attentionAfterDays: s.settings.attentionAfterDays ?? null,
    })),
    cards,
    attention: coordinator
      ? attention(
          cards.map((c) => ({
            id: c.id,
            stageId: c.stageId,
            stageEnteredAt: c.stageEnteredAt,
            facts: c.facts,
          })),
          stages.map((s) => ({
            id: s.id,
            name: s.name,
            attentionAfterDays: s.settings.attentionAfterDays ?? null,
          })),
          now,
        )
      : [],
  };
}

/* ---------------- Moving applications ---------------- */

export type MoveResult =
  | { ok: true; moved: number }
  | { ok: false; error: string }
  | { ok: false; checks: { applicationId: string; name: string; checks: ExitCheck[] }[] };

/**
 * Moves applications to an open stage. With failing exit checks and no `override`, nothing moves
 * and the checks come back for "Move anyway"; with `override`, each overridden check is audited.
 */
export async function moveApplications(
  actor: Actor,
  ws: Pick<Workspace, "id">,
  opportunityId: string,
  applicationIds: string[],
  toStageId: string,
  opts: { override?: boolean } = {},
): Promise<MoveResult> {
  assertOnOpportunity(actor, opportunityId, "application.move");
  const opp = await opportunityFor(actor, opportunityId);
  if (!opp) return { ok: false, error: "That opportunity is gone." };
  if (opp.status === "archived")
    return { ok: false, error: "This opportunity is archived. Restore it to move people." };
  const stages = await stagesOf(opp);
  const to = stages.find((s) => s.id === toStageId) ?? null;
  const problem = moveProblem(to);
  if (problem) return { ok: false, error: problem };
  const ids = [...new Set(applicationIds)].slice(0, 500);
  const rows = await db()
    .select({ app: a, name: schema.contacts.name, email: schema.contacts.email })
    .from(a)
    .innerJoin(schema.contacts, eq(schema.contacts.id, a.contactId))
    .where(
      and(
        applicationsVisibleTo(actor),
        eq(a.opportunityId, opp.id),
        inArray(a.id, ids),
        eq(a.state, "active"),
      ),
    );
  const movers = rows.filter((r) => r.app.stageId !== to!.id);
  if (!movers.length) return { ok: true, moved: 0 };
  const byId = new Map(stages.map((s) => [s.id, s]));
  const decided = movers.find((r) => leaveProblem(byId.get(r.app.stageId ?? "") ?? null));
  if (decided)
    return {
      ok: false,
      error: `${decided.name || decided.email}: ${leaveProblem(byId.get(decided.app.stageId!)!)}`,
    };
  const counts = await reviewCounts(
    actor,
    movers.map((r) => r.app),
  );
  const failing = movers
    .map((r) => ({
      applicationId: r.app.id,
      name: r.name || r.email,
      checks: exitChecks(byId.get(r.app.stageId ?? "")?.read ?? {}, counts.get(r.app.id)!),
    }))
    .filter((f) => f.checks.length);
  if (failing.length && !opts.override) return { ok: false, checks: failing };
  const by: AuditActor = { type: "user", id: actor.userId, label: "Coordinator" };
  const how = { actorType: "user" as const, actorId: actor.userId, depth: 0 };
  let moved = 0;
  for (const r of movers) {
    const from = r.app.stageId ? byId.get(r.app.stageId) : undefined;
    const done = await moveOne(ws.id, opp, r.app, from ?? null, to!, how, by);
    // Someone else moved them first: nothing happened here, so nothing to record.
    if (!done) continue;
    moved++;
    const overridden = failing.find((f) => f.applicationId === r.app.id);
    for (const c of overridden?.checks ?? [])
      await audit({
        workspace: ws.id,
        action: "application.exit_check_overridden",
        target: { type: "application", id: r.app.id, label: opp.title },
        changes: {
          check: { to: c.id },
          detail: { to: c.text },
          stage: { from: from?.name ?? null },
        },
      });
  }
  refreshWorkspace(ws.id);
  return { ok: true, moved };
}

/**
 * One application into an open stage: its row, the stage history, the stages' rules (leave the
 * old, enter the new) and the webhook. Shared by people's moves and rules' moves.
 */
export async function moveOne(
  workspaceId: string,
  opp: Pick<Opportunity, "id" | "title" | "pipelineId">,
  app: Pick<Application, "id" | "stageId">,
  from: Pick<PipelineStage, "id" | "key" | "category" | "name"> | null,
  to: Pick<PipelineStage, "id" | "key" | "category" | "name">,
  how: { actorType: "user" | "rule"; actorId: string | null; depth: number },
  auditActor: AuditActor,
) {
  const problem = moveProblem(to) ?? leaveProblem(from);
  if (problem) throw new PipelineError(problem);
  const now = new Date();
  const runs = await db().transaction(async (tx) => {
    const [moved] = await tx
      .update(a)
      .set({ stageId: to.id, stageEnteredAt: now, lastActivityAt: now })
      .where(and(eq(a.id, app.id), app.stageId ? eq(a.stageId, app.stageId) : isNull(a.stageId)))
      .returning({ id: a.id });
    if (!moved) return null;
    const [t] = await tx
      .insert(schema.stageTransitions)
      .values({
        workspaceId,
        pipelineId: opp.pipelineId,
        subjectType: "application",
        subjectId: app.id,
        fromStageId: from?.id ?? null,
        toStageId: to.id,
        actorType: how.actorType,
        actorId: how.actorId,
        depth: how.depth,
      })
      .returning({ id: schema.stageTransitions.id });
    return scheduleTransitionRules(tx, {
      workspaceId,
      subjectType: "application",
      subjectId: app.id,
      fromStageId: from?.id ?? null,
      toStageId: to.id,
      transitionId: t!.id,
      depth: how.depth,
    });
  });
  if (!runs) return false;
  await startRuns(runs);
  await audit({
    workspace: workspaceId,
    action: "application.moved",
    actor: auditActor,
    target: { type: "application", id: app.id, label: opp.title },
    changes: { stage: { from: from?.name ?? null, to: to.name } },
  });
  emitEvent(workspaceId, "application.stage_changed", {
    id: app.id,
    opportunityId: opp.id,
    from: from ? { key: from.key, category: from.category } : null,
    to: { key: to.key, category: to.category },
    by: how.actorType,
  });
  return true;
}

/* ---------------- One application (the candidate pane) ---------------- */

/**
 * What the candidate pane shows the actor about one application, or null when they may not see
 * it. Viewers get the pipeline facts without answers or documents; review progress is for
 * coordinators; accommodations only say they exist, to coordinators, and open on request.
 */
export async function applicationDetail(actor: Actor, applicationId: string, now = new Date()) {
  const [row] = await db()
    .select({ app: a, contact: schema.contacts })
    .from(a)
    .innerJoin(schema.contacts, eq(schema.contacts.id, a.contactId))
    .where(and(applicationsVisibleTo(actor), eq(a.id, applicationId)));
  if (!row) return null;
  const app = row.app;
  const role = roleOn(actor, app.opportunityId);
  const opp = await opportunityFor(actor, app.opportunityId);
  if (!opp) return null;
  const stages = await stagesOf(opp);
  const stage = stages.find((s) => s.id === app.stageId) ?? null;
  const viewer = role === "viewer" || !role;
  const coordinator = role === "coordinator";
  const [response, counts, interviews, accommodations] = await Promise.all([
    app.formResponseId && !viewer
      ? db().query.formResponses.findFirst({
          where: eq(schema.formResponses.id, app.formResponseId),
        })
      : null,
    reviewCounts(actor, [app], now),
    db()
      .select({
        id: schema.bookings.id,
        startAt: schema.bookings.startAt,
        endAt: schema.bookings.endAt,
        title: schema.eventTypes.title,
        hostUserId: schema.bookings.hostUserId,
        status: schema.bookings.status,
      })
      .from(schema.bookings)
      .leftJoin(schema.eventTypes, eq(schema.eventTypes.id, schema.bookings.eventTypeId))
      .where(
        and(
          eq(schema.bookings.applicationId, app.id),
          bookingsVisibleTo(actor.userId),
          inArray(schema.bookings.status, ["confirmed", "pending"]),
          gt(schema.bookings.endAt, now),
        ),
      )
      .orderBy(asc(schema.bookings.startAt)),
    coordinator ? hasAccommodations(actor, app) : false,
  ]);
  const version = response
    ? await db().query.formVersions.findFirst({
        where: eq(schema.formVersions.id, response.formVersionId),
      })
    : null;
  const files = response
    ? await db()
        .select({
          id: schema.files.id,
          name: schema.files.name,
          sourceId: schema.files.sourceId,
          scanStatus: schema.files.scanStatus,
        })
        .from(schema.files)
        .where(
          and(
            eq(schema.files.ownerType, "form_response"),
            eq(schema.files.ownerId, response.id),
            isNull(schema.files.deletedAt),
            eq(schema.files.status, "ready"),
          ),
        )
    : [];
  const decision = await db()
    .select({
      outcome: schema.decisions.outcome,
      status: schema.decisions.status,
      decidedAt: schema.decisions.decidedAt,
    })
    .from(schema.decisions)
    .where(eq(schema.decisions.applicationId, app.id))
    .orderBy(sql`${schema.decisions.decidedAt} desc`)
    .limit(1);
  const c = counts.get(app.id)!;
  return {
    application: app,
    contact: { name: row.contact.name, email: viewer ? null : row.contact.email },
    opportunity: { id: opp.id, title: opp.title, timezone: opp.settings.timezone ?? null },
    role,
    stage: stage ? { id: stage.id, name: stage.name, category: stage.category } : null,
    stages: stages.map((s) => ({ id: s.id, name: s.name, category: s.category })),
    form: (version?.schema ?? null) as FormSchema | null,
    answers: (response?.answers ?? {}) as Answers,
    editedAt: response && response.revision > 1 ? response.submittedAt : null,
    files,
    reviews: coordinator ? c : { total: 0, submitted: 0, overdue: 0, mine: c.mine },
    /** How many reviews the stage plans per application (its Reviews module), at least those assigned. */
    reviewsExpected:
      coordinator && stage?.read.reviews && stage.read.reviews.enabled !== false
        ? Math.max(c.total, stage.read.reviews.reviewersPerApplication)
        : 0,
    checks: coordinator && stage ? exitChecks(stage.read as StageModuleConfigs, c) : [],
    interviews,
    // Recorded decisions may not be released yet: coordinators only (decisions.md).
    decision: coordinator ? (decision[0] ?? null) : null,
    hasAccommodations: accommodations,
  };
}

/** The adjustments request, on a coordinator's click: every read is in the activity log. */
export async function showAccommodations(actor: Actor, applicationId: string) {
  const [app] = await db()
    .select({ id: a.id, workspaceId: a.workspaceId, opportunityId: a.opportunityId })
    .from(a)
    .where(and(applicationsVisibleTo(actor), eq(a.id, applicationId)));
  if (!app) throw new HiringAccessError("opportunity.view");
  return readAccommodations(actor, app);
}

/** A person looked at a requirement flag and clears it; the flag and who cleared it are audited. */
export async function clearFlag(actor: Actor, applicationId: string, requirement: string) {
  const [row] = await db()
    .select({ app: a })
    .from(a)
    .where(and(applicationsVisibleTo(actor), eq(a.id, applicationId)));
  if (!row) throw new HiringAccessError("opportunity.view");
  assertOnOpportunity(actor, row.app.opportunityId, "application.move");
  const flag = row.app.flags.find((f) => f.requirement === requirement);
  if (!flag) return;
  await db()
    .update(a)
    .set({ flags: row.app.flags.filter((f) => f.requirement !== requirement) })
    .where(eq(a.id, applicationId));
  await audit({
    workspace: row.app.workspaceId,
    action: "application.flag_cleared",
    target: { type: "application", id: applicationId },
    changes: { flag: { from: flag.requirement } },
  });
  refreshWorkspace(row.app.workspaceId);
}
