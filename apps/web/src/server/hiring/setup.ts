import "server-only";
import { and, asc, eq, inArray, isNull, ne, schema, sql } from "@bookly/db";
import type {
  Opportunity,
  OpportunitySettings,
  OpportunityType,
  PipelineStage,
  RuleAction,
  RuleTrigger,
  StageCategory,
  Workspace,
} from "@bookly/db/schema";
import type { ConditionGroup, FormSchema } from "@bookly/forms";
import { db } from "@/lib/db";
import { assertOnOpportunity, HiringAccessError, roleOn, type Actor } from "../access";
import { audit } from "../audit";
import { refreshWorkspace } from "../cache";
import { consentVersion, publishForm } from "../forms";
import { workspaceLimits } from "../limits";
import { STAGE_COLOR, stageKeyFor } from "../pipelines-text";
import {
  MODULE_KINDS,
  parseModule,
  readModules,
  type ModuleKind,
  type StageModuleConfigs,
} from "../pipelines/modules";
import { ruleProblems } from "../pipelines/rules-text";
import { emitEvent } from "../webhooks";
import { defaultRetentionDays, retentionDays, RETENTION } from "./hiring-text";
import { announceTeam, sendPendingInvites } from "./invites";
import { listTeam } from "./queries";
import {
  basicsProblems,
  categoryChangeProblem,
  copyTitle,
  hiringRuleProblem,
  isFinal,
  nextSlug,
  pipelineProblems,
  privacyNoticeTemplate,
  publishChecklist,
  removeProblem,
  slugify,
  STAGE_LIMITS,
  type BasicsInput,
  type SetupBasics,
  type SetupStage,
} from "./setup-text";
import { bindIds, TEMPLATES, type TemplateId } from "./templates";

/*
 * Opportunity setup (planning/v2/ux/opportunity-setup.md): drafts made from a template or a
 * copy, Basics, the stage and module editor, rules, privacy, and publish with its checklist.
 * Every write checks the actor may configure the opportunity (ADR 0005) and is audited; after
 * publish, each saved change is one `opportunity.setup_changed` entry with a readable summary.
 */

export class SetupError extends Error {}

const o = schema.opportunities;
const st = schema.pipelineStages;

/** Who may start an opportunity: anyone with a member seat (collaborators never coordinate). */
export const mayCreateOpportunity = (actor: Actor) => actor.workspaceRole !== "collaborator";

async function opportunityOf(actor: Actor, id: string) {
  const [opp] = await db()
    .select()
    .from(o)
    .where(and(eq(o.id, id), eq(o.workspaceId, actor.workspaceId)));
  return opp ?? null;
}

/** The opportunity, if the actor may change its setup; throws otherwise. */
async function configurable(actor: Actor, id: string): Promise<Opportunity> {
  assertOnOpportunity(actor, id, "opportunity.configure");
  const opp = await opportunityOf(actor, id);
  if (!opp) throw new SetupError("That opportunity is gone.");
  if (opp.status === "archived") throw new SetupError("Archived opportunities can't be changed.");
  return opp;
}

const defaultCohort = (opportunityId: string) =>
  db()
    .select()
    .from(schema.opportunityCohorts)
    .where(eq(schema.opportunityCohorts.opportunityId, opportunityId))
    .orderBy(
      sql`${schema.opportunityCohorts.isDefault} desc`,
      asc(schema.opportunityCohorts.position),
    )
    .limit(1)
    .then((r) => r[0] ?? null);

const liveStages = (pipelineId: string) =>
  db()
    .select()
    .from(st)
    .where(and(eq(st.pipelineId, pipelineId), isNull(st.archivedAt)))
    .orderBy(asc(st.position));

/** Applications per stage (drafts are not in a stage yet). */
async function stageCounts(opportunityId: string) {
  const rows = await db()
    .select({ stageId: schema.applications.stageId, n: sql<number>`count(*)::int` })
    .from(schema.applications)
    .where(
      and(
        eq(schema.applications.opportunityId, opportunityId),
        ne(schema.applications.state, "draft"),
      ),
    )
    .groupBy(schema.applications.stageId);
  return new Map(rows.filter((r) => r.stageId).map((r) => [r.stageId!, r.n]));
}

/** The stages as the editor and the checks read them. */
async function setupStages(opp: Opportunity): Promise<SetupStage[]> {
  const [stages, rules, counts] = await Promise.all([
    liveStages(opp.pipelineId),
    db()
      .select()
      .from(schema.stageRules)
      .where(eq(schema.stageRules.pipelineId, opp.pipelineId))
      .orderBy(asc(schema.stageRules.position), asc(schema.stageRules.createdAt)),
    stageCounts(opp.id),
  ]);
  const labels = opp.settings.statusLabels ?? {};
  return stages.map((s) => ({
    id: s.id,
    key: s.key,
    name: s.name,
    category: s.category,
    isEntry: s.isEntry,
    isWaitlist: s.isWaitlist,
    label: labels[s.key] ?? null,
    modules: readModules(s.modules).modules,
    rules: rules
      .filter((r) => r.stageId === s.id)
      .map((r) => ({
        id: r.id,
        name: r.name,
        trigger: r.trigger,
        conditions: r.conditions,
        actions: r.actions,
        active: r.active,
        delayMinutes: r.delayMinutes,
      })),
    applications: counts.get(s.id) ?? 0,
  }));
}

/** The application form's working copy (unpublished changes, else what is live). */
async function workingForm(formId: string | null): Promise<FormSchema | null> {
  if (!formId) return null;
  const form = await db().query.forms.findFirst({ where: eq(schema.forms.id, formId) });
  if (!form) return null;
  if (form.draft) return form.draft;
  if (!form.publishedVersionId) return null;
  const v = await db().query.formVersions.findFirst({
    where: eq(schema.formVersions.id, form.publishedVersionId),
  });
  return v?.schema ?? null;
}

const basicsOf = (
  opp: Opportunity,
  cohort: Awaited<ReturnType<typeof defaultCohort>>,
  wsTimezone: string,
): SetupBasics => ({
  title: opp.title,
  type: opp.type,
  status: opp.status,
  cohortName: cohort?.name || null,
  opensAt: cohort?.opensAt ?? null,
  closesAt: cohort?.closesAt ?? null,
  decidesBy: cohort?.decidesBy ?? null,
  capacity: cohort?.capacity ?? null,
  timezone: opp.settings.timezone ?? wsTimezone,
  slug: opp.slug,
});

/**
 * Everything the wizard shows for one opportunity, for anyone on its team; null for others.
 * `canConfigure` is false for reviewers, interviewers and viewers ("Only coordinators can
 * change this opportunity's setup").
 */
export async function loadSetup(
  actor: Actor,
  ws: Pick<Workspace, "timezone" | "name">,
  id: string,
) {
  if (!roleOn(actor, id)) return null;
  const opp = await opportunityOf(actor, id);
  if (!opp) return null;
  const [cohort, stages, form, team, invites] = await Promise.all([
    defaultCohort(opp.id),
    setupStages(opp),
    workingForm(opp.formId),
    listTeam(actor, opp.id),
    db()
      .select()
      .from(schema.opportunityInvites)
      .where(eq(schema.opportunityInvites.opportunityId, opp.id))
      .orderBy(asc(schema.opportunityInvites.createdAt)),
  ]);
  const scorecardIds = stages.flatMap((s) =>
    s.modules.reviews?.scorecardId ? [s.modules.reviews.scorecardId] : [],
  );
  const scorecards = scorecardIds.length
    ? await db()
        .select({
          id: schema.scorecards.id,
          name: schema.scorecards.name,
          criteria: schema.scorecards.criteria,
        })
        .from(schema.scorecards)
        .where(
          and(
            eq(schema.scorecards.workspaceId, actor.workspaceId),
            inArray(schema.scorecards.id, scorecardIds),
          ),
        )
    : [];
  const basics = basicsOf(opp, cohort, ws.timezone);
  const notice = opp.settings.privacyNotice?.text ?? "";
  const checklist = publishChecklist({
    basics,
    stages,
    form,
    privacyNotice: notice,
    coordinators: team.filter((m) => m.role === "coordinator").length,
  });
  return {
    opportunity: opp,
    cohort,
    basics,
    stages,
    form,
    team,
    invites,
    scorecards,
    checklist,
    problems: pipelineProblems(stages),
    retention: retentionDays(opp.type, opp.settings),
    canConfigure: roleOn(actor, id) === "coordinator",
  };
}
export type Setup = NonNullable<Awaited<ReturnType<typeof loadSetup>>>;

/* ---------------- Create: template or copy ---------------- */

async function takenSlugs(workspaceId: string, base: string) {
  const rows = await db()
    .select({ slug: o.slug })
    .from(o)
    .where(and(eq(o.workspaceId, workspaceId), sql`${o.slug} like ${`${base}%`}`));
  return rows.map((r) => r.slug);
}

type Tx = Parameters<Parameters<ReturnType<typeof db>["transaction"]>[0]>[0];

/** Inserts a hiring pipeline's stages (with their rules) in order; returns them by key. */
async function insertStages(
  tx: Tx,
  input: {
    workspaceId: string;
    pipelineId: string;
    userId: string;
    stages: {
      key: string;
      name: string;
      category: StageCategory;
      color?: string;
      isEntry: boolean;
      isWaitlist: boolean;
      settings?: PipelineStage["settings"];
      modules: StageModuleConfigs;
      rules: {
        name: string;
        trigger: RuleTrigger;
        conditions?: ConditionGroup | null;
        actions: RuleAction[];
        active?: boolean;
        delayMinutes?: number;
      }[];
    }[];
  },
) {
  for (const [i, s] of input.stages.entries()) {
    const [row] = await tx
      .insert(st)
      .values({
        workspaceId: input.workspaceId,
        pipelineId: input.pipelineId,
        key: s.key,
        name: s.name,
        category: s.category,
        color: s.color ?? STAGE_COLOR[s.category],
        position: i + 1,
        isEntry: s.isEntry,
        isWaitlist: s.isWaitlist,
        settings: s.settings ?? {},
        modules: s.modules,
      })
      .returning({ id: st.id });
    if (s.rules.length)
      await tx.insert(schema.stageRules).values(
        s.rules.map((r, j) => ({
          workspaceId: input.workspaceId,
          pipelineId: input.pipelineId,
          stageId: row!.id,
          name: r.name,
          trigger: r.trigger,
          conditions: r.conditions ?? null,
          actions: r.actions,
          active: r.active ?? true,
          delayMinutes: r.delayMinutes ?? 0,
          position: j,
          createdBy: input.userId,
        })),
      );
  }
}

/** Creates a draft from a template: its forms, scorecards, stages, rules and messages. */
export async function createFromTemplate(
  actor: Actor,
  ws: Pick<Workspace, "id" | "name" | "timezone">,
  templateId: TemplateId,
): Promise<string> {
  if (!mayCreateOpportunity(actor))
    throw new HiringAccessError(
      "opportunity.configure",
      "Only coordinators can create opportunities.",
    );
  const t = TEMPLATES[templateId];
  const title = "Untitled opportunity";
  const slug = nextSlug(slugify(title), await takenSlugs(ws.id, slugify(title)));
  const id = await db().transaction(async (tx) => {
    const ids: Record<string, string> = {};
    for (const [key, f] of Object.entries(t.forms)) {
      const [row] = await tx
        .insert(schema.forms)
        .values({
          workspaceId: ws.id,
          name: `${f.name}: ${title}`,
          purpose: f.purpose,
          shared: false,
          draft: f.schema,
          createdBy: actor.userId,
        })
        .returning({ id: schema.forms.id });
      ids[key] = row!.id;
    }
    for (const [key, s] of Object.entries(t.scorecards)) {
      const [row] = await tx
        .insert(schema.scorecards)
        .values({ workspaceId: ws.id, name: s.name, criteria: s.criteria })
        .returning({ id: schema.scorecards.id });
      ids[key] = row!.id;
    }
    const [pipeline] = await tx
      .insert(schema.pipelines)
      .values({
        workspaceId: ws.id,
        kind: "hiring",
        name: title,
        template: t.id,
        createdBy: actor.userId,
      })
      .returning({ id: schema.pipelines.id });
    await insertStages(tx, {
      workspaceId: ws.id,
      pipelineId: pipeline!.id,
      userId: actor.userId,
      stages: t.stages.map((s, i) => ({
        key: s.key,
        name: s.name,
        category: s.category,
        isEntry: i === 0,
        isWaitlist: !!s.isWaitlist,
        modules: bindIds(s.modules, ids),
        rules: (s.rules ?? []).map((r) => ({
          name: r.name,
          trigger: { on: r.on },
          actions: bindIds(r.actions, ids),
        })),
      })),
    });
    const settings: OpportunitySettings = {
      template: t.id,
      timezone: ws.timezone,
      accommodations: true,
      assignedReviewersOnly: true,
      statusLabels: Object.fromEntries(t.stages.map((s) => [s.key, s.label])),
      privacyNotice: notice(privacyNoticeTemplate(ws.name, defaultRetentionDays(t.type))),
    };
    const [opp] = await tx
      .insert(o)
      .values({
        workspaceId: ws.id,
        type: t.type,
        title,
        slug,
        pipelineId: pipeline!.id,
        formId: ids.$application!,
        settings,
        createdBy: actor.userId,
      })
      .returning({ id: o.id });
    await tx.insert(schema.opportunityCohorts).values({
      workspaceId: ws.id,
      opportunityId: opp!.id,
      name: "",
      isDefault: true,
    });
    await tx.insert(schema.opportunityMembers).values({
      workspaceId: ws.id,
      opportunityId: opp!.id,
      userId: actor.userId,
      role: "coordinator",
      addedBy: actor.userId,
    });
    return opp!.id;
  });
  await audit({
    workspace: ws.id,
    action: "opportunity.created",
    target: { type: "opportunity", id, label: title },
    changes: { template: { to: t.id } },
  });
  refreshWorkspace(ws.id);
  return id;
}

const notice = (text: string): NonNullable<OpportunitySettings["privacyNotice"]> => ({
  text,
  version: consentVersion(text),
});

/** Form ids a stage points at: its Forms module and its rules' form requests. */
const formIdsOf = (s: { modules: StageModuleConfigs; rules: { actions: RuleAction[] }[] }) => [
  ...(s.modules.forms?.forms.map((f) => f.formId) ?? []),
  ...s.rules.flatMap((r) =>
    r.actions.flatMap((a) => (a.type === "request_form" ? [a.formId] : [])),
  ),
];

/**
 * "Copy a previous opportunity" / "Copy for a new cycle": a new draft with the source's setup,
 * stages, modules, rules, forms, scorecards and messages (and its team only when asked). Never
 * applications, reviews, decisions or files. Dates are cleared and the slug is new.
 */
export async function cloneOpportunity(
  actor: Actor,
  ws: Pick<Workspace, "id">,
  sourceId: string,
  opts: { team: boolean },
): Promise<string> {
  if (!mayCreateOpportunity(actor))
    throw new HiringAccessError(
      "opportunity.configure",
      "Only coordinators can create opportunities.",
    );
  assertOnOpportunity(actor, sourceId, "opportunity.configure");
  const src = await opportunityOf(actor, sourceId);
  if (!src) throw new SetupError("That opportunity is gone.");
  const [stages, cohort, members, invites] = await Promise.all([
    setupStages(src),
    defaultCohort(src.id),
    db()
      .select({
        userId: schema.opportunityMembers.userId,
        role: schema.opportunityMembers.role,
        workspaceRole: schema.members.role,
      })
      .from(schema.opportunityMembers)
      .innerJoin(schema.workspaces, eq(schema.workspaces.id, schema.opportunityMembers.workspaceId))
      .innerJoin(
        schema.members,
        and(
          eq(schema.members.organizationId, schema.workspaces.organizationId),
          eq(schema.members.userId, schema.opportunityMembers.userId),
        ),
      )
      .where(eq(schema.opportunityMembers.opportunityId, src.id)),
    db()
      .select()
      .from(schema.opportunityInvites)
      .where(eq(schema.opportunityInvites.opportunityId, src.id)),
  ]);
  const title = copyTitle(src.title);
  const slug = nextSlug(slugify(title), await takenSlugs(ws.id, slugify(title)));
  const formIds = [
    ...new Set([src.formId, ...stages.flatMap(formIdsOf)].filter(Boolean)),
  ] as string[];
  const scorecardIds = [
    ...new Set(
      stages.flatMap((s) =>
        s.modules.reviews?.scorecardId ? [s.modules.reviews.scorecardId] : [],
      ),
    ),
  ];
  const [forms, scorecards] = await Promise.all([
    formIds.length
      ? db()
          .select()
          .from(schema.forms)
          .where(and(eq(schema.forms.workspaceId, ws.id), inArray(schema.forms.id, formIds)))
      : [],
    scorecardIds.length
      ? db()
          .select()
          .from(schema.scorecards)
          .where(
            and(
              eq(schema.scorecards.workspaceId, ws.id),
              inArray(schema.scorecards.id, scorecardIds),
            ),
          )
      : [],
  ]);
  const id = await db().transaction(async (tx) => {
    const ids: Record<string, string> = {};
    for (const f of forms) {
      const working =
        f.draft ??
        (f.publishedVersionId
          ? (
              await tx
                .select({ schema: schema.formVersions.schema })
                .from(schema.formVersions)
                .where(eq(schema.formVersions.id, f.publishedVersionId))
            )[0]?.schema
          : null) ??
        null;
      const [row] = await tx
        .insert(schema.forms)
        .values({
          workspaceId: ws.id,
          name: f.name.replace(src.title, title),
          purpose: f.purpose,
          shared: f.shared,
          draft: working,
          createdBy: actor.userId,
        })
        .returning({ id: schema.forms.id });
      ids[f.id] = row!.id;
    }
    for (const s of scorecards) {
      const [row] = await tx
        .insert(schema.scorecards)
        .values({ workspaceId: ws.id, name: s.name, criteria: s.criteria })
        .returning({ id: schema.scorecards.id });
      ids[s.id] = row!.id;
    }
    const [pipeline] = await tx
      .insert(schema.pipelines)
      .values({
        workspaceId: ws.id,
        kind: "hiring",
        name: title,
        template: "clone",
        createdBy: actor.userId,
      })
      .returning({ id: schema.pipelines.id });
    await insertStages(tx, {
      workspaceId: ws.id,
      pipelineId: pipeline!.id,
      userId: actor.userId,
      stages: stages.map((s) => ({
        key: s.key,
        name: s.name,
        category: s.category,
        isEntry: s.isEntry,
        isWaitlist: s.isWaitlist,
        modules: bindIds(s.modules, ids),
        rules: s.rules.map((r) => ({
          name: r.name,
          trigger: r.trigger,
          conditions: r.conditions,
          actions: bindIds(r.actions, ids),
          active: r.active,
          delayMinutes: r.delayMinutes,
        })),
      })),
    });
    const [opp] = await tx
      .insert(o)
      .values({
        workspaceId: ws.id,
        type: src.type,
        title,
        slug,
        summary: src.summary,
        description: src.description,
        location: src.location,
        pipelineId: pipeline!.id,
        formId: src.formId ? (ids[src.formId] ?? null) : null,
        settings: { ...src.settings, template: "clone" },
        clonedFromId: src.id,
        createdBy: actor.userId,
      })
      .returning({ id: o.id });
    await tx.insert(schema.opportunityCohorts).values({
      workspaceId: ws.id,
      opportunityId: opp!.id,
      name: cohort?.name ?? "",
      capacity: cohort?.capacity ?? null,
      isDefault: true,
    });
    const team = new Map<string, (typeof members)[number]["role"]>([[actor.userId, "coordinator"]]);
    if (opts.team)
      for (const m of members)
        if (
          !team.has(m.userId) &&
          !(m.role === "coordinator" && m.workspaceRole === "collaborator")
        )
          team.set(m.userId, m.role);
    await tx.insert(schema.opportunityMembers).values(
      [...team].map(([userId, role]) => ({
        workspaceId: ws.id,
        opportunityId: opp!.id,
        userId,
        role,
        addedBy: actor.userId,
      })),
    );
    if (opts.team && invites.length)
      await tx.insert(schema.opportunityInvites).values(
        invites.map((i) => ({
          workspaceId: ws.id,
          opportunityId: opp!.id,
          email: i.email,
          role: i.role,
          invitedBy: actor.userId,
        })),
      );
    return opp!.id;
  });
  await audit({
    workspace: ws.id,
    action: "opportunity.cloned",
    target: { type: "opportunity", id, label: title },
    changes: { source: { from: src.id }, teamCopied: { to: opts.team } },
  });
  refreshWorkspace(ws.id);
  return id;
}

/** Opportunities the actor may copy, newest first (the picker on Start). */
export async function copySources(actor: Actor) {
  if (!mayCreateOpportunity(actor)) return [];
  const rows = await db()
    .select({
      id: o.id,
      title: o.title,
      status: o.status,
      cohort: schema.opportunityCohorts.name,
      closesAt: schema.opportunityCohorts.closesAt,
    })
    .from(o)
    .leftJoin(
      schema.opportunityCohorts,
      and(
        eq(schema.opportunityCohorts.opportunityId, o.id),
        eq(schema.opportunityCohorts.isDefault, true),
      ),
    )
    .where(eq(o.workspaceId, actor.workspaceId))
    .orderBy(sql`${o.createdAt} desc`);
  return rows.filter((r) => roleOn(actor, r.id) === "coordinator");
}

/* ---------------- Changes after publish ---------------- */

/** One audit entry per saved change; after publish it is `opportunity.setup_changed`. */
async function changed(opp: Opportunity, summary: string, changes: Record<string, unknown> = {}) {
  await audit({
    workspace: opp.workspaceId,
    action: opp.status === "draft" ? "opportunity.draft_changed" : "opportunity.setup_changed",
    target: { type: "opportunity", id: opp.id, label: opp.title },
    changes: { summary: { to: summary }, ...changes },
  });
  refreshWorkspace(opp.workspaceId);
}

/* ---------------- Basics ---------------- */

export async function saveBasics(
  actor: Actor,
  id: string,
  input: BasicsInput,
): Promise<{ problems: Partial<Record<keyof BasicsInput, string>> }> {
  const opp = await configurable(actor, id);
  const problems = basicsProblems(input);
  if (!problems.slug && input.slug !== opp.slug) {
    const taken = await takenSlugs(actor.workspaceId, input.slug);
    if (taken.includes(input.slug))
      problems.slug = `That link is in use. Try ${nextSlug(input.slug, taken)}.`;
  }
  if (Object.keys(problems).length) return { problems };
  const cohort = await defaultCohort(opp.id);
  const title = input.title.trim();
  await db().transaction(async (tx) => {
    await tx
      .update(o)
      .set({
        title,
        type: input.type,
        slug: input.slug,
        settings: { ...opp.settings, timezone: input.timezone },
      })
      .where(eq(o.id, opp.id));
    await tx
      .update(schema.pipelines)
      .set({ name: title })
      .where(eq(schema.pipelines.id, opp.pipelineId));
    if (cohort)
      await tx
        .update(schema.opportunityCohorts)
        .set({
          name: input.cohortName.trim(),
          opensAt: input.opensAt,
          closesAt: input.closesAt,
          decidesBy: input.decidesBy,
          capacity: input.capacity,
        })
        .where(eq(schema.opportunityCohorts.id, cohort.id));
    if (opp.formId)
      await tx
        .update(schema.forms)
        .set({ name: sql`replace(${schema.forms.name}, ${opp.title}, ${title})` })
        .where(eq(schema.forms.id, opp.formId));
  });
  const diff = [
    title !== opp.title && `title "${title}"`,
    input.slug !== opp.slug && `link /apply/${input.slug}`,
    +(input.closesAt ?? 0) !== +(cohort?.closesAt ?? 0) && "close date",
    +(input.decidesBy ?? 0) !== +(cohort?.decidesBy ?? 0) && "decisions-by date",
    (input.capacity ?? null) !== (cohort?.capacity ?? null) && "seats",
  ].filter(Boolean);
  await changed({ ...opp, title }, diff.length ? `Basics: ${diff.join(", ")}` : "Basics saved");
  return { problems: {} };
}

/* ---------------- Stages ---------------- */

async function stagesFor(actor: Actor, id: string) {
  const opp = await configurable(actor, id);
  return { opp, stages: await setupStages(opp) };
}

function nameProblem(stages: SetupStage[], name: string, exceptKey?: string) {
  const n = name.trim();
  if (!n || n.length > STAGE_LIMITS.nameMax)
    return `Stage names are 1 to ${STAGE_LIMITS.nameMax} characters.`;
  if (stages.some((s) => s.key !== exceptKey && s.name.trim().toLowerCase() === n.toLowerCase()))
    return `There is already a stage called ${n}.`;
  return null;
}

/** Writes positions 1..n in the given order. */
async function writeOrder(tx: Tx, ids: string[]) {
  for (const [i, sid] of ids.entries())
    await tx
      .update(st)
      .set({ position: i + 1 })
      .where(eq(st.id, sid));
}

/** Adds a stage: open stages go before the outcomes, outcomes at the end. */
export async function addStage(
  actor: Actor,
  id: string,
  input: { name: string; category: StageCategory },
): Promise<string | null> {
  const { opp, stages } = await stagesFor(actor, id);
  if (stages.length >= STAGE_LIMITS.max) return `Use at most ${STAGE_LIMITS.max} stages.`;
  const problem = nameProblem(stages, input.name);
  if (problem) return problem;
  const name = input.name.trim();
  const key = stageKeyFor(
    name,
    stages.map((s) => s.key),
  );
  const firstFinal = stages.findIndex((s) => isFinal(s.category));
  const at = input.category === "open" && firstFinal >= 0 ? firstFinal : stages.length;
  const modules: StageModuleConfigs = isFinal(input.category)
    ? { messages: { v: 1, enabled: true, templates: [] } }
    : {};
  await db().transaction(async (tx) => {
    const [row] = await tx
      .insert(st)
      .values({
        workspaceId: opp.workspaceId,
        pipelineId: opp.pipelineId,
        key,
        name,
        category: input.category,
        color: STAGE_COLOR[input.category],
        position: stages.length + 1,
        modules,
      })
      .returning({ id: st.id });
    const order = stages.map((s) => s.id);
    order.splice(at, 0, row!.id);
    await writeOrder(tx, order);
  });
  await changed(opp, `Added stage ${name}`);
  return null;
}

export type StagePatch = {
  name?: string;
  category?: StageCategory;
  /** Candidate-facing label; "" = the default. */
  label?: string;
  isWaitlist?: boolean;
};

/** Renames, recategorises or relabels a stage, with the live-data guards of flow step 11. */
export async function updateStage(
  actor: Actor,
  id: string,
  stageId: string,
  patch: StagePatch,
): Promise<string | null> {
  const { opp, stages } = await stagesFor(actor, id);
  const stage = stages.find((s) => s.id === stageId);
  if (!stage) return "That stage is gone.";
  if (patch.name !== undefined) {
    const p = nameProblem(stages, patch.name, stage.key);
    if (p) return p;
  }
  const category = patch.category ?? stage.category;
  const catProblem = categoryChangeProblem(stage, category);
  if (catProblem) return catProblem;
  const waitlist = category === "hold" ? (patch.isWaitlist ?? stage.isWaitlist) : false;
  if (patch.label !== undefined && patch.label.length > 80)
    return "Keep the label under 80 characters.";
  const labels = { ...(opp.settings.statusLabels ?? {}) };
  if (patch.label !== undefined) {
    if (patch.label.trim()) labels[stage.key] = patch.label.trim();
    else delete labels[stage.key];
  }
  const modules = { ...stage.modules };
  // An outcome always carries a message module, sent when decisions are released.
  if (isFinal(category) && !modules.messages)
    modules.messages = { v: 1, enabled: true, templates: [] };
  await db().transaction(async (tx) => {
    if (waitlist && !stage.isWaitlist)
      await tx
        .update(st)
        .set({ isWaitlist: false })
        .where(and(eq(st.pipelineId, opp.pipelineId), eq(st.isWaitlist, true)));
    await tx
      .update(st)
      .set({
        ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
        category,
        isWaitlist: waitlist,
        modules,
        ...(category !== stage.category ? { color: STAGE_COLOR[category] } : {}),
      })
      .where(eq(st.id, stage.id));
    if (patch.label !== undefined)
      await tx
        .update(o)
        .set({ settings: { ...opp.settings, statusLabels: labels } })
        .where(eq(o.id, opp.id));
  });
  const what = [
    patch.name !== undefined &&
      patch.name.trim() !== stage.name &&
      `renamed ${stage.name} to ${patch.name.trim()}`,
    category !== stage.category && `${stage.name} is now ${category}`,
    patch.label !== undefined && `label of ${stage.name}`,
    waitlist !== stage.isWaitlist &&
      (waitlist ? `${stage.name} is the waitlist` : `${stage.name} is no longer the waitlist`),
  ].filter(Boolean);
  if (what.length)
    await changed(opp, `Stages: ${what.join(", ")}`, {
      ...(patch.name !== undefined && patch.name.trim() !== stage.name
        ? { stageName: { from: stage.name, to: patch.name.trim() } }
        : {}),
    });
  return null;
}

/** Sets the order of the stages (drag, keyboard or Move up/down). The entry stage stays first. */
export async function reorderStages(
  actor: Actor,
  id: string,
  keys: string[],
): Promise<string | null> {
  const { opp, stages } = await stagesFor(actor, id);
  if (keys.length !== stages.length || new Set(keys).size !== keys.length)
    return "Reload and try again.";
  const byKey = new Map(stages.map((s) => [s.key, s]));
  if (keys.some((k) => !byKey.has(k))) return "Reload and try again.";
  if (!byKey.get(keys[0]!)!.isEntry)
    return `${stages.find((s) => s.isEntry)?.name ?? "The first stage"} receives applications, so it stays first.`;
  if (keys.every((k, i) => stages[i]!.key === k)) return null;
  await db().transaction((tx) =>
    writeOrder(
      tx,
      keys.map((k) => byKey.get(k)!.id),
    ),
  );
  await changed(opp, `Stages reordered: ${keys.map((k) => byKey.get(k)!.name).join(" → ")}`);
  return null;
}

/** Copies a stage with its modules and rules, right after it. */
export async function duplicateStage(
  actor: Actor,
  id: string,
  stageId: string,
): Promise<string | null> {
  const { opp, stages } = await stagesFor(actor, id);
  const s = stages.find((x) => x.id === stageId);
  if (!s) return "That stage is gone.";
  if (stages.length >= STAGE_LIMITS.max) return `Use at most ${STAGE_LIMITS.max} stages.`;
  let name = `${s.name} copy`.slice(0, STAGE_LIMITS.nameMax);
  for (let i = 2; nameProblem(stages, name); i++)
    name = `${s.name} copy ${i}`.slice(0, STAGE_LIMITS.nameMax);
  const key = stageKeyFor(
    name,
    stages.map((x) => x.key),
  );
  await db().transaction(async (tx) => {
    const [row] = await tx
      .insert(st)
      .values({
        workspaceId: opp.workspaceId,
        pipelineId: opp.pipelineId,
        key,
        name,
        category: s.category,
        color: STAGE_COLOR[s.category],
        position: stages.length + 1,
        modules: s.modules,
      })
      .returning({ id: st.id });
    if (s.rules.length)
      await tx.insert(schema.stageRules).values(
        s.rules.map((r, j) => ({
          workspaceId: opp.workspaceId,
          pipelineId: opp.pipelineId,
          stageId: row!.id,
          name: r.name,
          trigger: r.trigger,
          actions: r.actions,
          active: r.active,
          position: j,
          createdBy: actor.userId,
        })),
      );
    const order = stages.map((x) => x.id);
    order.splice(stages.indexOf(s) + 1, 0, row!.id);
    await writeOrder(tx, order);
  });
  await changed(opp, `Duplicated stage ${s.name}`);
  return null;
}

/**
 * Removes a stage. Applications in it move to `moveTo` (an open stage) first, each move
 * recorded; history keeps the archived stage.
 */
export async function removeStage(
  actor: Actor,
  id: string,
  stageId: string,
  moveTo: string | null,
): Promise<string | null> {
  const { opp, stages } = await stagesFor(actor, id);
  const s = stages.find((x) => x.id === stageId);
  if (!s) return "That stage is gone.";
  const problem = removeProblem(stages, s.key, moveTo);
  if (problem) return problem;
  const rest = stages.filter((x) => x.id !== s.id);
  const after = pipelineProblems(rest).find((p) => p.code === "no_won" || p.code === "no_lost");
  if (after) return `${s.name} is the only ${s.category} stage. ${after.message}`;
  const target = stages.find((x) => x.key === moveTo);
  await db().transaction(async (tx) => {
    if (s.applications && target) {
      const moved = await tx
        .update(schema.applications)
        .set({ stageId: target.id, stageEnteredAt: new Date() })
        .where(
          and(eq(schema.applications.opportunityId, opp.id), eq(schema.applications.stageId, s.id)),
        )
        .returning({ id: schema.applications.id });
      if (moved.length)
        await tx.insert(schema.stageTransitions).values(
          moved.map((a) => ({
            workspaceId: opp.workspaceId,
            pipelineId: opp.pipelineId,
            subjectType: "application" as const,
            subjectId: a.id,
            fromStageId: s.id,
            toStageId: target.id,
            actorType: "user",
            actorId: actor.userId,
          })),
        );
    }
    await tx.update(st).set({ archivedAt: new Date(), isWaitlist: false }).where(eq(st.id, s.id));
    await tx
      .update(schema.stageRules)
      .set({ active: false })
      .where(eq(schema.stageRules.stageId, s.id));
  });
  await changed(
    opp,
    s.applications && target
      ? `Removed stage ${s.name}; moved ${s.applications} application${s.applications === 1 ? "" : "s"} to ${target.name}`
      : `Removed stage ${s.name}`,
  );
  return null;
}

/* ---------------- Modules ---------------- */

/** A module switched on for the first time: its schema's defaults. */
function freshModule(kind: ModuleKind): unknown {
  switch (kind) {
    case "payments":
      return { v: 1, enabled: true, amountCents: 5000, currency: "usd" };
    default:
      return { v: 1, enabled: true };
  }
}

/**
 * Switches a module on or off on a stage, or saves its configuration (`config`). Turning it off
 * keeps the configuration, so turning it back on restores it.
 */
export async function saveModule(
  actor: Actor,
  id: string,
  stageId: string,
  kind: ModuleKind,
  change: { enabled: boolean } | { config: unknown },
): Promise<string | null> {
  if (!(MODULE_KINDS as readonly string[]).includes(kind)) return "Unknown module.";
  const { opp, stages } = await stagesFor(actor, id);
  const s = stages.find((x) => x.id === stageId);
  if (!s) return "That stage is gone.";
  const current = s.modules[kind] as { enabled?: boolean } | undefined;
  let next: unknown;
  if ("enabled" in change) {
    if (!change.enabled && kind === "forms" && s.isEntry)
      return "The first stage collects the application, so Forms stays on.";
    next = current ? { ...current, enabled: change.enabled } : freshModule(kind);
    if (!current && !change.enabled) return null;
  } else next = change.config;
  const parsed = parseModule(kind, next);
  if ("problem" in parsed) return parsed.problem;
  const config = parsed.config as Record<string, unknown>;
  if (kind === "routing")
    for (const r of (config as NonNullable<StageModuleConfigs["routing"]>).rules)
      if ("stage" in r.to) {
        const to = stages.find((x) => x.key === (r.to as { stage: string }).stage);
        if (!to || isFinal(to.category))
          return "Routing can flag an application for a person, never move it to an outcome.";
      }
  if (kind === "reviews") {
    const sc = (config as NonNullable<StageModuleConfigs["reviews"]>).scorecardId;
    if (sc) {
      const own = await db().query.scorecards.findFirst({
        where: and(
          eq(schema.scorecards.id, sc),
          eq(schema.scorecards.workspaceId, opp.workspaceId),
        ),
        columns: { id: true },
      });
      if (!own) return "Choose one of your scorecards.";
    }
  }
  if (kind === "scheduling") {
    const ids = (config as NonNullable<StageModuleConfigs["scheduling"]>).sessions.map(
      (x) => x.eventTypeId,
    );
    if (ids.length) {
      const found = await db()
        .select({ id: schema.eventTypes.id })
        .from(schema.eventTypes)
        .where(
          and(
            eq(schema.eventTypes.workspaceId, opp.workspaceId),
            inArray(schema.eventTypes.id, ids),
          ),
        );
      if (found.length !== new Set(ids).size) return "Choose an event type of yours.";
    }
  }
  if (kind === "messages") {
    // Templates other rules send can't disappear from under them.
    const kept = new Set(
      (config as NonNullable<StageModuleConfigs["messages"]>).templates.map((t) => t.id),
    );
    const orphan = s.rules.find((r) =>
      r.actions.some((a) => a.type === "send_message" && !kept.has(a.templateId)),
    );
    if (orphan)
      return `The automation "${orphan.name}" sends that message. Remove it from the automation first.`;
  }
  await db()
    .update(st)
    .set({ modules: { ...s.modules, [kind]: config } })
    .where(eq(st.id, s.id));
  const label = kind.charAt(0).toUpperCase() + kind.slice(1);
  await changed(
    opp,
    "enabled" in change
      ? `${label} ${change.enabled ? "on" : "off"} for ${s.name}`
      : `${label} settings for ${s.name}`,
  );
  return null;
}

/* ---------------- Messages (one email = one template + its rule) ---------------- */

export type MessageDraft = {
  templateId: string | null;
  subject: string;
  body: string;
  /** Open stages: when it is sent. Outcomes: always at decision release. */
  when: "enter" | "leave";
};

const newTemplateId = (taken: Set<string>) => {
  let tid = "";
  do tid = `t_${Math.random().toString(36).slice(2, 8)}`;
  while (taken.has(tid) || tid.length < 8);
  return tid;
};

/**
 * Saves one candidate email on a stage. On an open stage it comes with the rule that sends it on
 * enter or leave; on an outcome it waits for decision release, so it never has a rule.
 */
export async function saveMessage(
  actor: Actor,
  id: string,
  stageId: string,
  draft: MessageDraft,
): Promise<string | null> {
  const { opp, stages } = await stagesFor(actor, id);
  const s = stages.find((x) => x.id === stageId);
  if (!s) return "That stage is gone.";
  const subject = draft.subject.trim();
  const body = draft.body.trim();
  if (!subject || subject.length > 200) return "Write a subject of up to 200 characters.";
  if (!body || body.length > 8000) return "Write the message (up to 8,000 characters).";
  const m = s.modules.messages ?? { v: 1 as const, enabled: true, templates: [] };
  const taken = new Set(m.templates.map((t) => t.id));
  const tid =
    draft.templateId && taken.has(draft.templateId) ? draft.templateId : newTemplateId(taken);
  const template = {
    id: tid,
    name: subject.slice(0, 120),
    channel: "email" as const,
    subject,
    body,
    transactional: true,
  };
  const templates = taken.has(tid)
    ? m.templates.map((t) => (t.id === tid ? template : t))
    : [...m.templates, template];
  const parsed = parseModule("messages", { ...m, enabled: true, templates });
  if ("problem" in parsed) return parsed.problem;
  const sending = s.rules.find(
    (r) =>
      r.actions.length === 1 &&
      r.actions[0]!.type === "send_message" &&
      r.actions[0]!.templateId === tid,
  );
  await db().transaction(async (tx) => {
    await tx
      .update(st)
      .set({ modules: { ...s.modules, messages: parsed.config } })
      .where(eq(st.id, s.id));
    if (isFinal(s.category)) return;
    if (sending)
      await tx
        .update(schema.stageRules)
        .set({ name: `Email: ${subject}`.slice(0, 120), trigger: { on: draft.when } })
        .where(eq(schema.stageRules.id, sending.id!));
    else if (
      !s.rules.some((r) => r.actions.some((a) => a.type === "send_message" && a.templateId === tid))
    )
      await tx.insert(schema.stageRules).values({
        workspaceId: opp.workspaceId,
        pipelineId: opp.pipelineId,
        stageId: s.id,
        name: `Email: ${subject}`.slice(0, 120),
        trigger: { on: draft.when },
        actions: [{ type: "send_message", templateId: tid }],
        position: s.rules.length,
        createdBy: actor.userId,
      });
  });
  await changed(opp, `Message "${subject}" on ${s.name}`);
  return null;
}

/** Deletes a stage email and the rule that only sent it. */
export async function deleteMessage(actor: Actor, id: string, stageId: string, templateId: string) {
  const { opp, stages } = await stagesFor(actor, id);
  const s = stages.find((x) => x.id === stageId);
  const m = s?.modules.messages;
  if (!s || !m) return "That stage is gone.";
  const t = m.templates.find((x) => x.id === templateId);
  if (!t) return null;
  const only = s.rules.filter(
    (r) =>
      r.actions.length === 1 &&
      r.actions[0]!.type === "send_message" &&
      r.actions[0]!.templateId === templateId,
  );
  const other = s.rules.find(
    (r) =>
      !only.includes(r) &&
      r.actions.some((a) => a.type === "send_message" && a.templateId === templateId),
  );
  if (other)
    return `The automation "${other.name}" also sends this message. Remove it there first.`;
  await db().transaction(async (tx) => {
    await tx
      .update(st)
      .set({
        modules: {
          ...s.modules,
          messages: { ...m, templates: m.templates.filter((x) => x.id !== templateId) },
        },
      })
      .where(eq(st.id, s.id));
    if (only.length)
      await tx.delete(schema.stageRules).where(
        inArray(
          schema.stageRules.id,
          only.map((r) => r.id!),
        ),
      );
  });
  await changed(opp, `Removed message "${t.subject}" from ${s.name}`);
  return null;
}

/* ---------------- Rules ---------------- */

export type RuleInput = {
  name: string;
  on: "enter" | "leave";
  /** Only for applications with this tag or track (empty: every application). */
  tag: string;
  actions: RuleAction[];
};

/**
 * Saves a rule on a hiring stage: the shared checks (ADR 0002) plus hiring's guardrails: no
 * rule moves an application to an outcome, and outcomes' messages wait for decision release.
 */
export async function saveHiringRule(
  actor: Actor,
  id: string,
  stageId: string,
  ruleId: string | null,
  input: RuleInput,
): Promise<string[]> {
  const { opp, stages } = await stagesFor(actor, id);
  const s = stages.find((x) => x.id === stageId);
  if (!s) return ["That stage is gone."];
  const existing = ruleId ? s.rules.find((r) => r.id === ruleId) : null;
  if (ruleId && !existing) return ["That rule is gone."];
  const tag = input.tag.trim().toLowerCase();
  const rule = {
    name: input.name.trim().slice(0, 120),
    trigger: { on: input.on } as const,
    conditions: tag
      ? {
          match: "all" as const,
          conditions: [{ fieldId: "tags", op: "equals" as const, value: tag }],
        }
      : null,
    actions: input.actions,
    delayMinutes: 0,
  };
  const problems = ruleProblems(rule, {
    subject: "application",
    stageKey: s.key,
    stageKeys: stages.map((x) => x.key),
    modules: s.modules,
  });
  for (const a of input.actions) {
    const p = hiringRuleProblem(a, s, stages);
    if (p) problems.push(p);
    if (a.type === "request_form" && !s.modules.forms?.forms.some((f) => f.formId === a.formId))
      problems.push("Choose a form switched on for this stage.");
  }
  if (problems.length) return [...new Set(problems)];
  if (existing)
    await db().update(schema.stageRules).set(rule).where(eq(schema.stageRules.id, existing.id!));
  else
    await db()
      .insert(schema.stageRules)
      .values({
        workspaceId: opp.workspaceId,
        pipelineId: opp.pipelineId,
        stageId: s.id,
        ...rule,
        position: s.rules.length,
        createdBy: actor.userId,
      });
  await changed(opp, `${existing ? "Changed" : "Added"} rule "${rule.name}" on ${s.name}`);
  return [];
}

export async function deleteHiringRule(actor: Actor, id: string, ruleId: string) {
  const { opp, stages } = await stagesFor(actor, id);
  const s = stages.find((x) => x.rules.some((r) => r.id === ruleId));
  const r = s?.rules.find((x) => x.id === ruleId);
  if (!s || !r) return;
  await db().delete(schema.stageRules).where(eq(schema.stageRules.id, ruleId));
  await changed(opp, `Removed rule "${r.name}" from ${s.name}`);
}

/* ---------------- Privacy and applicant experience ---------------- */

export type PrivacyInput = {
  notice: string;
  retentionDays: number;
  accommodations: boolean;
  senderName: string;
  replyTo: string;
};

export async function savePrivacy(
  actor: Actor,
  id: string,
  input: PrivacyInput,
): Promise<string | null> {
  const opp = await configurable(actor, id);
  const text = input.notice.trim();
  if (text.length > 20_000) return "Keep the notice under 20,000 characters.";
  if (
    !Number.isInteger(input.retentionDays) ||
    input.retentionDays < RETENTION.min ||
    input.retentionDays > RETENTION.max
  )
    return "Keep applications for 30 days to 24 months.";
  if (input.senderName.length > 80) return "Keep the sender name under 80 characters.";
  const replyTo = input.replyTo.trim();
  if (replyTo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(replyTo))
    return "Enter a valid reply-to address.";
  const settings: OpportunitySettings = {
    ...opp.settings,
    privacyNotice: text ? notice(text) : undefined,
    retentionDays: input.retentionDays,
    accommodations: input.accommodations,
    senderName: input.senderName.trim() || undefined,
    replyTo: replyTo || undefined,
  };
  await db().update(o).set({ settings }).where(eq(o.id, opp.id));
  const diff = [
    (opp.settings.privacyNotice?.text ?? "") !== text && "privacy notice",
    retentionDays(opp.type, opp.settings) !== input.retentionDays &&
      `retention ${input.retentionDays} days`,
    (opp.settings.accommodations ?? true) !== input.accommodations &&
      `accommodations ${input.accommodations ? "on" : "off"}`,
  ].filter(Boolean);
  await changed(opp, diff.length ? `Privacy: ${diff.join(", ")}` : "Privacy saved");
  return null;
}

/* ---------------- Publish, close, archive ---------------- */

export type PublishResult =
  | { ok: true; scheduled: Date | null; slug: string; title: string }
  | { ok: false; reasons: string[]; limit?: { other: string | null } };

/**
 * Publishes a draft (all or nothing): every checklist item must pass and the plan must allow
 * another open opportunity. The application form's working copy is published with it, the team
 * hears about it, invitations to people outside the workspace go out, and the
 * `opportunity.published` webhook fires.
 */
export async function publishOpportunity(
  actor: Actor,
  ws: Workspace,
  id: string,
): Promise<PublishResult> {
  const setup = await loadSetup(actor, ws, id);
  if (!setup || !setup.canConfigure)
    throw new HiringAccessError(
      "opportunity.configure",
      "Only coordinators can change this opportunity's setup.",
    );
  const { opportunity: opp, checklist, basics } = setup;
  if (opp.status !== "draft")
    return { ok: false, reasons: ["This opportunity is already published."] };
  const failing = checklist.filter((i) => !i.ok);
  if (failing.length) return { ok: false, reasons: failing.map((i) => i.id) };
  const max = workspaceLimits(ws).opportunities;
  if (max !== null) {
    const open = await db()
      .select({ title: o.title })
      .from(o)
      .where(and(eq(o.workspaceId, ws.id), eq(o.status, "open")));
    if (open.length >= max)
      return {
        ok: false,
        reasons: ["open_opportunities"],
        limit: { other: open[0]?.title ?? null },
      };
  }
  if (opp.formId) {
    const r = await publishForm(ws.id, opp.formId, setup.form, actor.userId);
    if (r.problems.length) return { ok: false, reasons: r.problems };
  }
  const now = new Date();
  const [row] = await db()
    .update(o)
    .set({ status: "open", publishedAt: now })
    .where(and(eq(o.id, opp.id), eq(o.status, "draft")))
    .returning({ id: o.id });
  if (!row) return { ok: false, reasons: ["This opportunity is already published."] };
  await audit({
    workspace: ws.id,
    action: "opportunity.published",
    target: { type: "opportunity", id: opp.id, label: opp.title },
    changes: { status: { from: "draft", to: "open" } },
  });
  emitEvent(ws.id, "opportunity.published", {
    id: opp.id,
    title: opp.title,
    type: opp.type,
    slug: opp.slug,
    opensAt: basics.opensAt?.toISOString() ?? null,
    closesAt: basics.closesAt?.toISOString() ?? null,
    decidesBy: basics.decidesBy?.toISOString() ?? null,
  });
  await Promise.all([
    sendPendingInvites(ws, opp, actor.userId),
    announceTeam(
      ws,
      opp,
      setup.team.map((m) => ({ userId: m.userId, role: m.role })),
      actor.userId,
    ),
  ]);
  refreshWorkspace(ws.id);
  return {
    ok: true,
    scheduled: basics.opensAt && basics.opensAt > now ? basics.opensAt : null,
    slug: opp.slug,
    title: opp.title,
  };
}

/** Closes applications early. Drafts started before the close keep the grace period. */
export async function closeOpportunity(actor: Actor, id: string): Promise<string | null> {
  const opp = await configurable(actor, id);
  if (opp.status !== "open") return "Only open opportunities can close.";
  const now = new Date();
  await db().transaction(async (tx) => {
    await tx.update(o).set({ status: "closed" }).where(eq(o.id, opp.id));
    await tx
      .update(schema.opportunityCohorts)
      .set({ closesAt: now })
      .where(
        and(
          eq(schema.opportunityCohorts.opportunityId, opp.id),
          sql`(${schema.opportunityCohorts.closesAt} is null or ${schema.opportunityCohorts.closesAt} > ${now})`,
        ),
      );
  });
  await audit({
    workspace: opp.workspaceId,
    action: "opportunity.closed",
    target: { type: "opportunity", id: opp.id, label: opp.title },
    changes: { status: { from: "open", to: "closed" } },
  });
  refreshWorkspace(opp.workspaceId);
  return null;
}

/** Applications that haven't heard a released final decision yet (archive is blocked by them). */
export async function unheardCount(opportunityId: string): Promise<number> {
  const [r] = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.applications)
    .where(
      and(
        eq(schema.applications.opportunityId, opportunityId),
        eq(schema.applications.state, "active"),
        sql`not exists (
          select 1 from ${schema.decisions} d
          where d.application_id = ${schema.applications.id} and d.status = 'final' and d.notified_at is not null
        )`,
      ),
    );
  return r?.n ?? 0;
}

/** Archives an opportunity once every applicant has heard their final decision. */
export async function archiveOpportunity(
  actor: Actor,
  id: string,
): Promise<{ unheard: number } | null> {
  const opp = await configurable(actor, id);
  const unheard = await unheardCount(opp.id);
  if (unheard) {
    await audit({
      workspace: opp.workspaceId,
      action: "opportunity.archive_blocked",
      target: { type: "opportunity", id: opp.id, label: opp.title },
      changes: { unheard: { to: unheard } },
    });
    return { unheard };
  }
  await db().update(o).set({ status: "archived" }).where(eq(o.id, opp.id));
  await audit({
    workspace: opp.workspaceId,
    action: "opportunity.archived",
    target: { type: "opportunity", id: opp.id, label: opp.title },
    changes: { status: { from: opp.status, to: "archived" } },
  });
  refreshWorkspace(opp.workspaceId);
  return null;
}

/** Deletes a draft that was never published, with everything it created. */
export async function discardDraft(actor: Actor, id: string): Promise<string | null> {
  const opp = await configurable(actor, id);
  if (opp.status !== "draft" || opp.publishedAt) return "Only drafts can be discarded.";
  const stages = await setupStages(opp);
  const formIds = [
    ...new Set([opp.formId, ...stages.flatMap(formIdsOf)].filter(Boolean)),
  ] as string[];
  const scorecardIds = stages.flatMap((s) =>
    s.modules.reviews?.scorecardId ? [s.modules.reviews.scorecardId] : [],
  );
  await db().transaction(async (tx) => {
    await tx.delete(o).where(eq(o.id, opp.id));
    await tx.delete(schema.pipelines).where(eq(schema.pipelines.id, opp.pipelineId));
    if (formIds.length)
      await tx
        .delete(schema.forms)
        .where(
          and(
            eq(schema.forms.workspaceId, opp.workspaceId),
            inArray(schema.forms.id, formIds),
            isNull(schema.forms.publishedVersionId),
          ),
        );
    if (scorecardIds.length)
      await tx
        .delete(schema.scorecards)
        .where(
          and(
            eq(schema.scorecards.workspaceId, opp.workspaceId),
            inArray(schema.scorecards.id, scorecardIds),
          ),
        );
  });
  await audit({
    workspace: opp.workspaceId,
    action: "opportunity.draft_discarded",
    target: { type: "opportunity", id: opp.id, label: opp.title },
  });
  refreshWorkspace(opp.workspaceId);
  return null;
}

/** The opportunity types the Basics select offers, template types first. */
export const TYPE_LABELS: Partial<Record<OpportunityType, string>> = {
  fellowship: "Fellowship",
  cohort: "Cohort",
  internship: "Internship",
  program: "Program",
  admissions: "Admissions",
  custom: "Other",
};
