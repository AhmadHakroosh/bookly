import "server-only";
import { and, asc, eq, isNull, notExists, schema, sql } from "@bookly/db";
import type { Contact, Pipeline, PipelineStage, StageCategory, Workspace } from "@bookly/db/schema";
import { cacheLife, cacheTag } from "next/cache";
import { db } from "@/lib/db";
import { serializeContact } from "./api";
import { refreshWorkspace, workspaceTag } from "./cache";
import { emitEvent } from "./webhooks";
import { hasFlag } from "./flags";
import {
  archiveProblem,
  CLIENT_PIPELINE,
  editProblems,
  legacyStageFor,
  STAGE_COLOR,
  stageForKey,
  stageKeyFor,
  swapTarget,
} from "./pipelines-text";

/**
 * Pipelines and stages (ADR 0001). Every workspace has one client pipeline, seeded from the
 * four stages contacts had before; hiring adds one per opportunity later. `moveToStage()` is
 * the only code that changes a stage. Through 1.0.x it also writes the legacy
 * `contacts.stage` column, which is dropped in 1.1.
 */

export type ClientPipeline = { pipeline: Pipeline; stages: PipelineStage[] };

/** Words `setStage` callers pass as `by` that are not a user id. */
const SYSTEM_ACTORS = new Set(["system", "api", "capture", "recap"]);

const defaultClientPipeline = (workspaceId: string) =>
  db().query.pipelines.findFirst({
    where: and(
      eq(schema.pipelines.workspaceId, workspaceId),
      eq(schema.pipelines.kind, "client"),
      eq(schema.pipelines.isDefault, true),
    ),
  });

const liveStages = (pipelineId: string) =>
  db()
    .select()
    .from(schema.pipelineStages)
    .where(
      and(
        eq(schema.pipelineStages.pipelineId, pipelineId),
        isNull(schema.pipelineStages.archivedAt),
      ),
    )
    .orderBy(asc(schema.pipelineStages.position));

/**
 * The workspace's client pipeline with its live stages in order, created from the template the
 * first time. Idempotent: two first calls at once both end up with the same pipeline (the
 * partial unique index lets one insert win).
 */
export async function ensureClientPipeline(workspaceId: string): Promise<ClientPipeline> {
  let pipeline = await defaultClientPipeline(workspaceId);
  if (!pipeline) {
    await db()
      .insert(schema.pipelines)
      .values({
        workspaceId,
        kind: "client",
        name: CLIENT_PIPELINE.name,
        template: CLIENT_PIPELINE.template,
        isDefault: true,
      })
      .onConflictDoNothing();
    pipeline = (await defaultClientPipeline(workspaceId))!;
  }
  let stages = await liveStages(pipeline.id);
  if (!stages.length) {
    await db()
      .insert(schema.pipelineStages)
      .values(
        CLIENT_PIPELINE.stages.map((s, i) => ({
          workspaceId,
          pipelineId: pipeline.id,
          key: s.key,
          name: s.name,
          category: s.category,
          color: s.color,
          position: i + 1,
          isEntry: !!s.isEntry,
          settings: s.settings ?? {},
          modules: s.modules ?? {},
        })),
      )
      .onConflictDoNothing();
    stages = await liveStages(pipeline.id);
  }
  return { pipeline, stages };
}

/**
 * The client pipeline's live stages in order, for readers (cached per workspace; the pipeline
 * editor refreshes it). Empty only before the pipeline exists, which the backfill prevents.
 */
export async function clientStages(workspaceId: string): Promise<PipelineStage[]> {
  "use cache";
  cacheTag(workspaceTag(workspaceId));
  cacheLife("hours");
  const pipeline = await defaultClientPipeline(workspaceId);
  return pipeline ? liveStages(pipeline.id) : [];
}

/** A stage as the admin shows it: picker option, filter tab, badge. */
export type StageChoice = { key: string; name: string; color: string; emphasis: boolean };

const CLASSIC: StageChoice[] = CLIENT_PIPELINE.stages.map((s) => ({
  key: s.key,
  name: s.name,
  color: s.color,
  emphasis: s.key === "active" || s.key === "won",
}));

/**
 * The stages the admin offers. Behind `pipelines`: the workspace's own client stages (renamed,
 * reordered, added). Otherwise the four classic ones, exactly as before pipelines.
 */
export async function stageChoices(ws: Pick<Workspace, "id" | "settings">): Promise<{
  choices: StageChoice[];
  keyOf: (c: Pick<Contact, "stageId" | "stage">) => string;
}> {
  if (!(await hasFlag(ws, "pipelines"))) return { choices: CLASSIC, keyOf: (c) => c.stage };
  const stages = await clientStages(ws.id);
  const byId = new Map(stages.map((s) => [s.id, s.key]));
  return {
    choices: stages.map((s) => ({
      key: s.key,
      name: s.name,
      color: s.color,
      emphasis: !!s.settings.priorityScheduling || s.category === "won",
    })),
    keyOf: (c) => (c.stageId ? (byId.get(c.stageId) ?? c.stage) : c.stage),
  };
}

/** Where new contacts start in the client pipeline. */
export async function clientEntryStage(workspaceId: string): Promise<PipelineStage | undefined> {
  const { stages } = await ensureClientPipeline(workspaceId);
  return stages.find((s) => s.isEntry) ?? stages[0];
}

/** The key of the contact's client stage ("lead", "active"…), falling back to the legacy column. */
export async function clientStageKey(contact: Pick<Contact, "stageId" | "stage">) {
  if (!contact.stageId) return contact.stage;
  const [s] = await db()
    .select({ key: schema.pipelineStages.key })
    .from(schema.pipelineStages)
    .where(eq(schema.pipelineStages.id, contact.stageId));
  return s?.key ?? contact.stage;
}

/** The live client stage with this key, if the workspace still has one. */
export async function clientStageByKey(workspaceId: string, key: string) {
  const { stages } = await ensureClientPipeline(workspaceId);
  return stageForKey(stages, key);
}

const stageRef = (s: PipelineStage | null | undefined) =>
  s ? { id: s.id, key: s.key, name: s.name, category: s.category } : null;

/**
 * Moves a contact to a stage of the workspace's client pipeline: the one writer of
 * `contacts.stage_id`. In one transaction it updates the contact (and the legacy column) and
 * records the transition; then it logs the timeline entry, sends `contact.stage_changed` and
 * refreshes the workspace. `by` is a user id or "system", "api", "capture", "recap". Returns
 * false when nothing moved (unknown contact or stage, or already there).
 */
export async function moveToStage(input: {
  workspaceId: string;
  contactId: string;
  toStageId: string;
  by: string;
  /** How many rule-driven moves led here (ADR 0002). */
  depth?: number;
}): Promise<boolean> {
  const { workspaceId, contactId, toStageId, by } = input;
  const actorType = SYSTEM_ACTORS.has(by) ? by : "user";
  const actorId = actorType === "user" ? by : null;

  const result = await db().transaction(async (tx) => {
    const [contact] = await tx
      .select()
      .from(schema.contacts)
      .where(and(eq(schema.contacts.id, contactId), eq(schema.contacts.workspaceId, workspaceId)))
      .for("update");
    if (!contact || contact.stageId === toStageId) return null;
    const [to] = await tx
      .select({ stage: schema.pipelineStages })
      .from(schema.pipelineStages)
      .innerJoin(schema.pipelines, eq(schema.pipelines.id, schema.pipelineStages.pipelineId))
      .where(
        and(
          eq(schema.pipelineStages.id, toStageId),
          eq(schema.pipelineStages.workspaceId, workspaceId),
          isNull(schema.pipelineStages.archivedAt),
          eq(schema.pipelines.kind, "client"),
          eq(schema.pipelines.isDefault, true),
        ),
      );
    if (!to) return null;
    const legacy = legacyStageFor(to.stage);
    const [from] = contact.stageId
      ? await tx
          .select()
          .from(schema.pipelineStages)
          .where(eq(schema.pipelineStages.id, contact.stageId))
      : [];
    const [updated] = await tx
      .update(schema.contacts)
      .set({ stageId: to.stage.id, stageEnteredAt: new Date(), stage: legacy })
      .where(eq(schema.contacts.id, contactId))
      .returning();
    // A contact created before it had a stage, put where its legacy column already said:
    // attach it quietly instead of reporting a move that did not happen.
    if (!contact.stageId && contact.stage === legacy) return null;
    await tx.insert(schema.stageTransitions).values({
      workspaceId,
      pipelineId: to.stage.pipelineId,
      subjectType: "contact",
      subjectId: contactId,
      fromStageId: contact.stageId,
      toStageId: to.stage.id,
      actorType,
      actorId,
      depth: input.depth ?? 0,
    });
    return { before: contact, updated: updated!, from, to: to.stage, legacy };
  });
  if (!result) return false;

  const { before, updated, from, to, legacy } = result;
  // Lazy: contacts.ts calls into this module for every stage change.
  const contacts = await import("./contacts");
  await contacts.logContactEvent(
    workspaceId,
    contactId,
    "stage_changed",
    // Named stages, so moves between custom open stages (both `lead` underneath) still read.
    `Stage: ${from?.name ?? before.stage} → ${to.name}`,
    { data: { from: before.stage, to: legacy, by, fromStage: from?.key, toStage: to.key } },
  );
  emitEvent(workspaceId, "contact.stage_changed", {
    contact: serializeContact(updated),
    from: before.stage,
    to: legacy,
    by,
    fromStage: stageRef(from),
    toStage: stageRef(to),
  });
  void contacts.afterContactChange(workspaceId, updated);
  refreshWorkspace(workspaceId);
  return true;
}

/**
 * Safety net until 1.1: gives every workspace its client pipeline and every contact without a
 * stage the one its legacy column names. Set-based and idempotent; runs on boot and as the
 * `pipelines.backfill` job. Returns how many contacts it fixed.
 */
export async function backfillClientPipelines(): Promise<number> {
  const missing = await db()
    .select({ id: schema.workspaces.id })
    .from(schema.workspaces)
    .where(
      notExists(
        db()
          .select({ one: sql`1` })
          .from(schema.pipelines)
          .where(
            and(
              eq(schema.pipelines.workspaceId, schema.workspaces.id),
              eq(schema.pipelines.kind, "client"),
              eq(schema.pipelines.isDefault, true),
            ),
          ),
      ),
    );
  for (const w of missing) await ensureClientPipeline(w.id);
  const fixed = await db().execute(sql`
    update ${schema.contacts} c
    set stage_id = s.id, stage_entered_at = c.updated_at
    from ${schema.pipelineStages} s
    join ${schema.pipelines} p on p.id = s.pipeline_id
    where c.stage_id is null
      and p.workspace_id = c.workspace_id and p.kind = 'client' and p.is_default
      and s.key = c.stage and s.archived_at is null
  `);
  return fixed.rowCount ?? 0;
}

/* ---------------- Editing (Settings → Pipeline, behind `pipelines`) ---------------- */

/** How many contacts sit in each live client stage. */
export async function stageCounts(workspaceId: string): Promise<Map<string, number>> {
  const rows = await db()
    .select({ stageId: schema.contacts.stageId, n: sql<number>`count(*)::int` })
    .from(schema.contacts)
    .where(eq(schema.contacts.workspaceId, workspaceId))
    .groupBy(schema.contacts.stageId);
  return new Map(rows.filter((r) => r.stageId).map((r) => [r.stageId!, r.n]));
}

type StagePatch = {
  name?: string;
  category?: StageCategory;
  color?: string;
  priorityScheduling?: boolean;
  isEntry?: boolean;
};

/** Edits one client stage; returns why not, or null. The key never changes. */
export async function updateStage(
  workspaceId: string,
  id: string,
  patch: StagePatch,
): Promise<string | null> {
  const { stages } = await ensureClientPipeline(workspaceId);
  const stage = stages.find((s) => s.id === id);
  if (!stage) return "That stage no longer exists.";
  const problems = editProblems(stages, id, patch);
  if (problems.length) return problems[0]!;
  await db().transaction(async (tx) => {
    // Only one live entry stage (a partial unique index): clear the old one first.
    if (patch.isEntry && !stage.isEntry)
      await tx
        .update(schema.pipelineStages)
        .set({ isEntry: false })
        .where(eq(schema.pipelineStages.pipelineId, stage.pipelineId));
    await tx
      .update(schema.pipelineStages)
      .set({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.category ? { category: patch.category } : {}),
        ...(patch.color ? { color: patch.color } : {}),
        ...(patch.isEntry !== undefined ? { isEntry: patch.isEntry } : {}),
        ...(patch.priorityScheduling !== undefined
          ? { settings: { ...stage.settings, priorityScheduling: patch.priorityScheduling } }
          : {}),
      })
      .where(eq(schema.pipelineStages.id, id));
  });
  refreshWorkspace(workspaceId);
  return null;
}

/** Adds a stage at the end of the client pipeline; returns why not, or null. */
export async function addStage(
  workspaceId: string,
  input: { name: string; category: StageCategory },
): Promise<string | null> {
  const name = input.name.trim().slice(0, 60);
  if (!name) return "Give the stage a name.";
  const { pipeline, stages } = await ensureClientPipeline(workspaceId);
  if (stages.length >= 30) return "A pipeline has at most 30 stages.";
  await db()
    .insert(schema.pipelineStages)
    .values({
      workspaceId,
      pipelineId: pipeline.id,
      key: stageKeyFor(
        name,
        stages.map((s) => s.key),
      ),
      name,
      category: input.category,
      color: STAGE_COLOR[input.category],
      position: (stages.at(-1)?.position ?? 0) + 1,
    });
  refreshWorkspace(workspaceId);
  return null;
}

/** Moves a stage one place up or down (swaps positions with its neighbour). */
export async function moveStage(workspaceId: string, id: string, dir: "up" | "down") {
  const { stages } = await ensureClientPipeline(workspaceId);
  const stage = stages.find((s) => s.id === id);
  const other = swapTarget(stages, id, dir);
  if (!stage || !other) return;
  await db().transaction(async (tx) => {
    await tx
      .update(schema.pipelineStages)
      .set({ position: other.position })
      .where(eq(schema.pipelineStages.id, stage.id));
    await tx
      .update(schema.pipelineStages)
      .set({ position: stage.position })
      .where(eq(schema.pipelineStages.id, other.id));
  });
  refreshWorkspace(workspaceId);
}

/**
 * Archives a stage, first moving everyone in it to `moveTo` (each move recorded like any
 * other). History keeps the archived stage; its key is free again. Returns why not, or null.
 */
export async function archiveStage(
  workspaceId: string,
  id: string,
  moveTo: string | null,
  by: string,
): Promise<string | null> {
  const { stages } = await ensureClientPipeline(workspaceId);
  const inStage = (await stageCounts(workspaceId)).get(id) ?? 0;
  const problem = archiveProblem(stages, id, inStage, moveTo);
  if (problem) return problem;
  if (inStage && moveTo) {
    const people = await db()
      .select({ id: schema.contacts.id })
      .from(schema.contacts)
      .where(and(eq(schema.contacts.workspaceId, workspaceId), eq(schema.contacts.stageId, id)));
    for (const p of people)
      await moveToStage({ workspaceId, contactId: p.id, toStageId: moveTo, by });
  }
  await db()
    .update(schema.pipelineStages)
    .set({ archivedAt: new Date() })
    .where(
      and(eq(schema.pipelineStages.id, id), eq(schema.pipelineStages.workspaceId, workspaceId)),
    );
  refreshWorkspace(workspaceId);
  return null;
}
