import "server-only";
import { and, asc, eq, inArray, lt, lte, or, schema, sql } from "@bookly/db";
import type { Contact, StageRule, StageRuleRun, Workspace } from "@bookly/db/schema";
import { evaluate } from "@bookly/forms";
import { db } from "@/lib/db";
import { SYSTEM_ACTOR, audit } from "../audit";
import { hasFlag } from "../flags";
import { enqueue } from "../jobs";
import { countUsage, workspaceLimits } from "../limits";
import { runAction, RuleStop } from "./actions";
import { fromEditor, type EditorRule } from "./editor-text";
import { MODULE_KINDS, parseModule, readModules, type StageModuleConfigs } from "./modules";
import { contactFacts, retryAt, resumeFrom, ruleProblems } from "./rules-text";

/*
 * Running stage rules (ADR 0002). A move schedules a run per matching rule in the move's own
 * transaction (one per rule and cause, so a double schedule is impossible); after commit a
 * `pipeline.rule` job runs it, and the 5-minute `pipeline.rules` sweep picks up any whose job
 * was lost. A run claims itself, checks the subject is still where the rule expects, evaluates
 * its conditions, then runs its actions in order, resuming after the last one done when retried.
 */

type Tx = Parameters<Parameters<ReturnType<typeof db>["transaction"]>[0]>[0];

/** The active client-pipeline rules a plan allows, oldest first (a downgrade stops the newest). */
async function allowedRuleIds(ws: Workspace, ruleIds: string[]): Promise<Set<string>> {
  const max = workspaceLimits(ws).stageRules;
  if (max === null || !ruleIds.length) return new Set(ruleIds);
  const firstN = await db()
    .select({ id: schema.stageRules.id })
    .from(schema.stageRules)
    .innerJoin(schema.pipelines, eq(schema.pipelines.id, schema.stageRules.pipelineId))
    .where(
      and(
        eq(schema.stageRules.workspaceId, ws.id),
        eq(schema.stageRules.active, true),
        eq(schema.pipelines.kind, "client"),
      ),
    )
    .orderBy(asc(schema.stageRules.createdAt))
    .limit(max);
  const ok = new Set(firstN.map((r) => r.id));
  return new Set(ruleIds.filter((id) => ok.has(id)));
}

/**
 * Inside `moveToStage`'s transaction: one run for every active `leave` rule on the stage left
 * and `enter` rule on the stage entered. Returns the runs to start once the move commits.
 */
export async function scheduleTransitionRules(
  tx: Tx,
  t: {
    workspaceId: string;
    subjectType: "contact" | "application";
    subjectId: string;
    fromStageId: string | null;
    toStageId: string;
    transitionId: string;
    depth: number;
  },
): Promise<{ id: string; runAt: Date }[]> {
  const ws = await tx.query.workspaces.findFirst({
    where: eq(schema.workspaces.id, t.workspaceId),
  });
  // Hiring rules are part of hiring (free on every plan, ADR 0002); client rules are their own beta.
  if (!ws || !(await hasFlag(ws, t.subjectType === "application" ? "hiring" : "stage_rules")))
    return [];
  const rules = await tx
    .select()
    .from(schema.stageRules)
    .where(
      and(
        eq(schema.stageRules.workspaceId, t.workspaceId),
        eq(schema.stageRules.active, true),
        or(
          and(
            eq(schema.stageRules.stageId, t.toStageId),
            sql`${schema.stageRules.trigger}->>'on' = 'enter'`,
          ),
          t.fromStageId
            ? and(
                eq(schema.stageRules.stageId, t.fromStageId),
                sql`${schema.stageRules.trigger}->>'on' = 'leave'`,
              )
            : sql`false`,
        ),
      ),
    )
    .orderBy(asc(schema.stageRules.position));
  if (!rules.length) return [];
  const allowed = await allowedRuleIds(
    ws,
    rules.map((r) => r.id),
  );
  const now = Date.now();
  const rows = await tx
    .insert(schema.stageRuleRuns)
    .values(
      rules.map((r) => ({
        workspaceId: t.workspaceId,
        ruleId: r.id,
        subjectType: t.subjectType,
        subjectId: t.subjectId,
        causeId: t.transitionId,
        depth: t.depth,
        runAt: new Date(now + r.delayMinutes * 60_000),
        // Over the plan's limit: kept as a skipped run so the editor can say why.
        ...(allowed.has(r.id)
          ? {}
          : { status: "skipped" as const, results: ["skipped:plan"], finishedAt: new Date() }),
      })),
    )
    .onConflictDoNothing()
    .returning({
      id: schema.stageRuleRuns.id,
      runAt: schema.stageRuleRuns.runAt,
      status: schema.stageRuleRuns.status,
    });
  return rows.filter((r) => r.status === "pending");
}

/**
 * For module events (a booking made, a form sent…): one run per active `event` rule on the
 * subject's current stage. `eventId` makes the same event scheduled twice one run.
 */
export async function scheduleEventRules(input: {
  ws: Workspace;
  event: string;
  eventId: string;
  contact: Pick<Contact, "id" | "stageId">;
}): Promise<void> {
  const { ws, contact } = input;
  if (!contact.stageId || !(await hasFlag(ws, "stage_rules"))) return;
  const rules = await db()
    .select()
    .from(schema.stageRules)
    .where(
      and(
        eq(schema.stageRules.workspaceId, ws.id),
        eq(schema.stageRules.stageId, contact.stageId),
        eq(schema.stageRules.active, true),
        sql`${schema.stageRules.trigger}->>'on' = 'event'`,
        sql`${schema.stageRules.trigger}->>'event' = ${input.event}`,
      ),
    );
  if (!rules.length) return;
  const allowed = await allowedRuleIds(
    ws,
    rules.map((r) => r.id),
  );
  const runs = await db()
    .insert(schema.stageRuleRuns)
    .values(
      rules
        .filter((r) => allowed.has(r.id))
        .map((r) => ({
          workspaceId: ws.id,
          ruleId: r.id,
          subjectType: "contact" as const,
          subjectId: contact.id,
          causeId: `${input.event}:${input.eventId}`,
          runAt: new Date(Date.now() + r.delayMinutes * 60_000),
        })),
    )
    .onConflictDoNothing()
    .returning({ id: schema.stageRuleRuns.id, runAt: schema.stageRuleRuns.runAt });
  await startRuns(runs);
}

/** After commit: a job per run, at its time (the sweep is the safety net). */
export async function startRuns(runs: { id: string; runAt: Date }[]) {
  for (const r of runs)
    await enqueue(
      "pipeline.rule",
      { runId: r.id },
      { delaySeconds: Math.max(0, (r.runAt.getTime() - Date.now()) / 1000), dedupeId: r.id },
    ).catch((e) => console.error("[rules] enqueue failed", r.id, e));
}

/** Claims a due run: only one worker gets it. */
async function claim(runId: string): Promise<StageRuleRun | null> {
  const [run] = await db()
    .update(schema.stageRuleRuns)
    .set({ status: "running", attempts: sql`${schema.stageRuleRuns.attempts} + 1` })
    .where(
      and(
        eq(schema.stageRuleRuns.id, runId),
        eq(schema.stageRuleRuns.status, "pending"),
        lte(schema.stageRuleRuns.runAt, new Date()),
      ),
    )
    .returning();
  return run ?? null;
}

async function finish(run: StageRuleRun, status: "done" | "skipped" | "failed", results: string[]) {
  await db()
    .update(schema.stageRuleRuns)
    .set({ status, results, finishedAt: new Date() })
    .where(eq(schema.stageRuleRuns.id, run.id));
}

/** Runs one rule run (the `pipeline.rule` job). Never throws. */
export async function runRule(runId: string): Promise<void> {
  const run = await claim(runId);
  if (!run) return;
  let results = [...run.results];
  try {
    const rule = await db().query.stageRules.findFirst({
      where: eq(schema.stageRules.id, run.ruleId),
    });
    if (!rule || !rule.active) return finish(run, "skipped", ["skipped:inactive"]);
    if (run.subjectType === "application") {
      // Applications have their own executor (candidate emails, outcome guard); a throw retries.
      const { runForApplication } = await import("../hiring/rule-actions");
      const r = await runForApplication(run, rule, results, async (next) => {
        results = next;
        await db()
          .update(schema.stageRuleRuns)
          .set({ results: next })
          .where(eq(schema.stageRuleRuns.id, run.id));
      });
      return finish(run, r.status, r.results);
    }
    const [ws, contact, stage] = await Promise.all([
      db().query.workspaces.findFirst({ where: eq(schema.workspaces.id, run.workspaceId) }),
      run.subjectType === "contact"
        ? db().query.contacts.findFirst({
            where: and(
              eq(schema.contacts.id, run.subjectId),
              eq(schema.contacts.workspaceId, run.workspaceId),
            ),
          })
        : null,
      db().query.pipelineStages.findFirst({ where: eq(schema.pipelineStages.id, rule.stageId) }),
    ]);
    // Applications arrive with hiring (Phase 5); until then a run for one is skipped.
    if (!ws || !contact || !stage) return finish(run, "skipped", ["skipped:gone"]);
    if (!(await hasFlag(ws, "stage_rules"))) return finish(run, "skipped", ["skipped:off"]);
    // A delayed enter rule only acts on people still in the stage.
    if (rule.trigger.on !== "leave" && contact.stageId !== rule.stageId)
      return finish(run, "skipped", ["skipped:left_stage"]);
    const facts = contactFacts({ ...contact, stageKey: stage.key });
    if (!evaluate(rule.conditions ?? undefined, facts))
      return finish(run, "skipped", ["skipped:conditions"]);

    const { modules, problems } = readModules(stage.modules);
    if (problems.length) console.warn("[rules] stage modules ignored", stage.id, problems);
    const ctx = { ws, rule, run, contact, stage, modules };
    for (let i = resumeFrom(results); i < rule.actions.length; i++) {
      results[i] = await runAction(ctx, rule.actions[i]!, i);
      await db()
        .update(schema.stageRuleRuns)
        .set({ results })
        .where(eq(schema.stageRuleRuns.id, run.id));
    }
    await finish(run, "done", results);
    await afterRun(ws, rule, contact, results);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const i = resumeFrom(results);
    results = [...results.slice(0, i), `failed:${message.slice(0, 200)}`];
    const next = e instanceof RuleStop ? null : retryAt(run.attempts);
    if (next) {
      await db()
        .update(schema.stageRuleRuns)
        .set({ status: "pending", results, runAt: next })
        .where(eq(schema.stageRuleRuns.id, run.id));
      await enqueue(
        "pipeline.rule",
        { runId: run.id },
        { delaySeconds: (next.getTime() - Date.now()) / 1000 },
      ).catch(() => {});
    } else {
      await finish(run, "failed", results);
      await onFailure(run, message).catch((err) => console.error("[rules] failure notice", err));
    }
  }
}

/** The subject's timeline and the activity log say which automation ran and what it did. */
async function afterRun(ws: Workspace, rule: StageRule, contact: Contact, results: string[]) {
  const done = results.filter((r) => r === "done").length;
  const { logContactEvent } = await import("../contacts");
  await logContactEvent(ws.id, contact.id, "automation", `Automation "${rule.name}" ran`, {
    data: { ruleId: rule.id, results },
  });
  await audit({
    workspace: ws.id,
    actor: SYSTEM_ACTOR(`rule:${rule.id}`),
    action: "stage_rule.ran",
    target: { type: "contact", id: contact.id, label: contact.name || contact.email },
    changes: { rule: { to: rule.name }, actions: { to: `${done} of ${results.length}` } },
  });
}

/** A run that failed for good: owners and admins hear about it (realtime first, ADR 0007). */
async function onFailure(run: StageRuleRun, message: string) {
  const [ws, rule] = await Promise.all([
    db().query.workspaces.findFirst({ where: eq(schema.workspaces.id, run.workspaceId) }),
    db().query.stageRules.findFirst({ where: eq(schema.stageRules.id, run.ruleId) }),
  ]);
  if (!ws || !rule) return;
  const { notify } = await import("../notifications");
  const managers = await db()
    .select({ userId: schema.members.userId })
    .from(schema.members)
    .where(
      and(
        eq(schema.members.organizationId, ws.organizationId),
        inArray(schema.members.role, ["owner", "admin"]),
      ),
    );
  for (const m of managers)
    await notify(ws, m.userId, {
      kind: "automation",
      title: `Automation "${rule.name}" failed`,
      body: message.slice(0, 300),
      link: run.subjectType === "contact" ? `/admin/contacts/${run.subjectId}` : "/admin",
      dedupeKey: `rule-failed:${run.id}`,
    });
}

/** The `pipeline.rules` sweep: due runs whose job never came, oldest first; old runs pruned. */
export async function runDueRules(now = new Date(), limit = 100): Promise<number> {
  const due = await db()
    .select({ id: schema.stageRuleRuns.id })
    .from(schema.stageRuleRuns)
    .where(and(eq(schema.stageRuleRuns.status, "pending"), lte(schema.stageRuleRuns.runAt, now)))
    .orderBy(asc(schema.stageRuleRuns.runAt))
    .limit(limit);
  for (const r of due) await runRule(r.id);
  // Retention: finished runs older than 90 days (failed ones stay for the record).
  await db()
    .delete(schema.stageRuleRuns)
    .where(
      and(
        inArray(schema.stageRuleRuns.status, ["done", "skipped"]),
        lt(schema.stageRuleRuns.createdAt, new Date(now.getTime() - 90 * 86_400_000)),
      ),
    );
  return due.length;
}

/* ---------------- The editor ---------------- */

/** A stage's rules in order, with how their recent runs went. */
export async function stageRulesOf(workspaceId: string, stageId: string) {
  const rules = await db()
    .select()
    .from(schema.stageRules)
    .where(
      and(eq(schema.stageRules.workspaceId, workspaceId), eq(schema.stageRules.stageId, stageId)),
    )
    .orderBy(asc(schema.stageRules.position), asc(schema.stageRules.createdAt));
  if (!rules.length) return [];
  const stats = await db()
    .select({
      ruleId: schema.stageRuleRuns.ruleId,
      status: schema.stageRuleRuns.status,
      n: sql<number>`count(*)::int`,
    })
    .from(schema.stageRuleRuns)
    .where(
      inArray(
        schema.stageRuleRuns.ruleId,
        rules.map((r) => r.id),
      ),
    )
    .groupBy(schema.stageRuleRuns.ruleId, schema.stageRuleRuns.status);
  return rules.map((r) => ({
    ...r,
    runs: Object.fromEntries(stats.filter((s) => s.ruleId === r.id).map((s) => [s.status, s.n])),
  }));
}

/**
 * Saves an automation from the editor: the rule, and the stage's module config it uses (its
 * emails, checklist, booking sessions, payment). Checks the rule, every id it points at (same
 * workspace only) and the plan's limit. Returns what is wrong, or the rule's id.
 */
export async function saveRule(
  ws: Workspace,
  input: { stageId: string; ruleId: string | null; draft: EditorRule; userId: string },
): Promise<{ problems: string[] } | { id: string }> {
  const stage = await db().query.pipelineStages.findFirst({
    where: and(
      eq(schema.pipelineStages.id, input.stageId),
      eq(schema.pipelineStages.workspaceId, ws.id),
    ),
  });
  if (!stage || stage.archivedAt) return { problems: ["That stage is gone."] };
  const [pipeline, stages, others] = await Promise.all([
    db().query.pipelines.findFirst({ where: eq(schema.pipelines.id, stage.pipelineId) }),
    db()
      .select({ key: schema.pipelineStages.key })
      .from(schema.pipelineStages)
      .where(
        and(
          eq(schema.pipelineStages.pipelineId, stage.pipelineId),
          sql`${schema.pipelineStages.archivedAt} is null`,
        ),
      ),
    db()
      .select({ id: schema.stageRules.id, actions: schema.stageRules.actions })
      .from(schema.stageRules)
      .where(eq(schema.stageRules.stageId, stage.id)),
  ]);
  if (!pipeline) return { problems: ["That stage is gone."] };
  // Hiring stages keep their rules in the opportunity's setup, with hiring's guardrails.
  if (pipeline.kind !== "client")
    return { problems: ["Edit this stage's rules in the opportunity's setup."] };
  const subject = "contact";
  const existing = input.ruleId ? others.find((r) => r.id === input.ruleId) : null;
  if (input.ruleId && !existing) return { problems: ["That automation is gone."] };
  const keep = new Set(
    others
      .filter((r) => r.id !== input.ruleId)
      .flatMap((r) => r.actions.flatMap((a) => (a.type === "send_message" ? [a.templateId] : []))),
  );
  const { rule, modules } = fromEditor(input.draft, readModules(stage.modules).modules, keep);
  const problems = ruleProblems(rule, {
    subject,
    stageKey: stage.key,
    stageKeys: stages.map((s) => s.key),
    modules,
  });
  const checked: StageModuleConfigs = {};
  for (const kind of MODULE_KINDS) {
    if (!modules[kind]) continue;
    const r = parseModule(kind, modules[kind]);
    if ("problem" in r) problems.push(r.problem);
    else (checked as Record<string, unknown>)[kind] = r.config;
  }
  problems.push(...(await foreignIds(ws.id, rule.actions, checked)));
  if (!existing && pipeline.kind === "client") {
    const max = workspaceLimits(ws).stageRules;
    if (max !== null) {
      if ((await countUsage(ws, "stageRules")) >= max)
        problems.push(
          `Your plan includes ${max} automations on the client pipeline. Upgrade for unlimited.`,
        );
    }
  }
  if (problems.length) return { problems: [...new Set(problems)] };
  return db().transaction(async (tx) => {
    await tx
      .update(schema.pipelineStages)
      .set({ modules: checked })
      .where(eq(schema.pipelineStages.id, stage.id));
    if (existing) {
      await tx
        .update(schema.stageRules)
        .set({ ...rule })
        .where(eq(schema.stageRules.id, existing.id));
      return { id: existing.id };
    }
    const [row] = await tx
      .insert(schema.stageRules)
      .values({
        workspaceId: ws.id,
        pipelineId: stage.pipelineId,
        stageId: stage.id,
        ...rule,
        position: others.length,
        createdBy: input.userId,
      })
      .returning({ id: schema.stageRules.id });
    return { id: row!.id };
  });
}

/** Ids an automation points at must be this workspace's own (and still usable). */
async function foreignIds(
  workspaceId: string,
  actions: { type: string; formId?: string }[],
  modules: StageModuleConfigs,
): Promise<string[]> {
  const out: string[] = [];
  const eventTypeIds = (modules.scheduling?.sessions ?? []).map((s) => s.eventTypeId);
  if (eventTypeIds.length) {
    const found = await db()
      .select({ id: schema.eventTypes.id })
      .from(schema.eventTypes)
      .where(
        and(
          eq(schema.eventTypes.workspaceId, workspaceId),
          inArray(schema.eventTypes.id, eventTypeIds),
        ),
      );
    if (found.length !== new Set(eventTypeIds).size) out.push("Choose an event type of yours.");
  }
  for (const a of actions)
    if (a.type === "request_form") {
      const rf = await db().query.routingForms.findFirst({
        where: and(
          eq(schema.routingForms.workspaceId, workspaceId),
          eq(schema.routingForms.formId, a.formId ?? ""),
        ),
        columns: { id: true },
      });
      if (!rf) out.push("Choose one of your routing forms.");
    }
  return out;
}

/** Turns an automation on or off. Turning one on counts against the plan again. */
export async function setRuleActive(
  ws: Workspace,
  ruleId: string,
  active: boolean,
): Promise<string | null> {
  const rule = await db().query.stageRules.findFirst({
    where: and(eq(schema.stageRules.id, ruleId), eq(schema.stageRules.workspaceId, ws.id)),
  });
  if (!rule) return "That automation is gone.";
  if (active && !rule.active) {
    const max = workspaceLimits(ws).stageRules;
    if (max !== null && (await countUsage(ws, "stageRules")) >= max)
      return `Your plan includes ${max} automations on the client pipeline. Upgrade for unlimited.`;
  }
  await db().update(schema.stageRules).set({ active }).where(eq(schema.stageRules.id, ruleId));
  return null;
}

/** Deletes an automation; runs already scheduled are skipped when they come up. */
export async function deleteRule(ws: Workspace, ruleId: string): Promise<StageRule | null> {
  const [row] = await db()
    .delete(schema.stageRules)
    .where(and(eq(schema.stageRules.id, ruleId), eq(schema.stageRules.workspaceId, ws.id)))
    .returning();
  return row ?? null;
}
