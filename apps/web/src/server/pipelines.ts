import "server-only";
import { and, asc, eq, isNull, notExists, schema, sql } from "@bookly/db";
import type { Contact, Pipeline, PipelineStage } from "@bookly/db/schema";
import { db } from "@/lib/db";
import { serializeContact } from "./api";
import { refreshWorkspace } from "./cache";
import { emitEvent } from "./webhooks";
import { CLIENT_PIPELINE, legacyStageFor } from "./pipelines-text";

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
  return stages.find((s) => s.key === key);
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
    `Stage: ${before.stage} → ${legacy}`,
    { data: { from: before.stage, to: legacy, by, fromStage: from?.key, toStage: to.key } },
  );
  emitEvent(workspaceId, "contact.stage_changed", {
    contact: serializeContact(updated),
    from: before.stage,
    to: legacy,
    by,
    from_stage: stageRef(from),
    to_stage: stageRef(to),
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
