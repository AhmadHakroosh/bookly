import "server-only";
import { and, eq, isNull, ne, schema } from "@bookly/db";
import type { RuleAction, StageRule, StageRuleRun } from "@bookly/db/schema";
import { evaluate, type Answers } from "@bookly/forms";
import { db } from "@/lib/db";
import { SYSTEM_ACTOR, audit } from "../audit";
import { hasFlag } from "../flags";
import { notify } from "../notifications";
import { readModules, type StageModuleConfigs } from "../pipelines/modules";
import { MAX_DEPTH, resumeFrom } from "../pipelines/rules-text";
import { emailCandidate } from "./apply";
import { moveOne } from "./pipeline";
import { leaveProblem } from "./pipeline-text";
import { isFinal } from "./setup-text";

/*
 * Stage rules for applications (ADR 0002 with hiring's guardrails). A run checks the application
 * is still where the rule expects, evaluates its conditions over the tags, track and answers,
 * then runs its actions in order: candidate emails (with the status link they already have),
 * telling the team, tags, routing (a track or a flag, never a rejection) and moves between open
 * stages. Nothing here ever reaches an outcome: emails on outcome stages wait for decision
 * release, and a move to an outcome is refused even if a stage was recategorised after the rule
 * was saved. Actions whose module ships later (reviews, booking links, forms, payments, tasks)
 * are skipped with the reason.
 */

type Outcome = { status: "done" | "skipped"; results: string[] };

export async function runForApplication(
  run: StageRuleRun,
  rule: StageRule,
  previous: string[],
  save: (results: string[]) => Promise<void>,
): Promise<Outcome> {
  const [ws, app, stage] = await Promise.all([
    db().query.workspaces.findFirst({ where: eq(schema.workspaces.id, run.workspaceId) }),
    db().query.applications.findFirst({
      where: and(
        eq(schema.applications.id, run.subjectId),
        eq(schema.applications.workspaceId, run.workspaceId),
      ),
    }),
    db().query.pipelineStages.findFirst({ where: eq(schema.pipelineStages.id, rule.stageId) }),
  ]);
  if (!ws || !app || !stage) return { status: "skipped", results: ["skipped:gone"] };
  if (!(await hasFlag(ws, "hiring"))) return { status: "skipped", results: ["skipped:off"] };
  if (app.state !== "active") return { status: "skipped", results: ["skipped:inactive"] };
  if (rule.trigger.on !== "leave" && app.stageId !== rule.stageId)
    return { status: "skipped", results: ["skipped:left_stage"] };
  // A decision has put them in an outcome since (a delayed or leave rule): rules stop there.
  const current = app.stageId
    ? await db().query.pipelineStages.findFirst({
        where: eq(schema.pipelineStages.id, app.stageId),
      })
    : null;
  if (rule.trigger.on === "leave" && current && isFinal(current.category))
    return { status: "skipped", results: ["skipped:decided"] };
  const opp = await db().query.opportunities.findFirst({
    where: eq(schema.opportunities.id, app.opportunityId),
  });
  if (!opp) return { status: "skipped", results: ["skipped:gone"] };
  const response = app.formResponseId
    ? await db().query.formResponses.findFirst({
        where: eq(schema.formResponses.id, app.formResponseId),
      })
    : null;
  const facts: Answers = {
    ...((response?.answers ?? {}) as Answers),
    tags: app.tags,
    stage: stage.key,
  };
  if (!evaluate(rule.conditions ?? undefined, facts))
    return { status: "skipped", results: ["skipped:conditions"] };

  const { modules } = readModules(stage.modules);
  const results = [...previous];
  for (let i = resumeFrom(results); i < rule.actions.length; i++) {
    results[i] = await act(rule.actions[i]!, {
      ws,
      app,
      opp,
      stage,
      modules,
      rule,
      run,
      answers: facts,
    });
    await save(results);
  }
  const done = results.filter((r) => r === "done").length;
  await audit({
    workspace: ws.id,
    actor: SYSTEM_ACTOR(`rule:${rule.id}`),
    action: "stage_rule.ran",
    target: { type: "application", id: app.id, label: opp.title },
    changes: { rule: { to: rule.name }, actions: { to: `${done} of ${results.length}` } },
  });
  return { status: done ? "done" : "skipped", results };
}

type Ctx = {
  ws: NonNullable<Awaited<ReturnType<ReturnType<typeof db>["query"]["workspaces"]["findFirst"]>>>;
  app: NonNullable<
    Awaited<ReturnType<ReturnType<typeof db>["query"]["applications"]["findFirst"]>>
  >;
  opp: NonNullable<
    Awaited<ReturnType<ReturnType<typeof db>["query"]["opportunities"]["findFirst"]>>
  >;
  stage: NonNullable<
    Awaited<ReturnType<ReturnType<typeof db>["query"]["pipelineStages"]["findFirst"]>>
  >;
  modules: StageModuleConfigs;
  rule: StageRule;
  run: StageRuleRun;
  answers: Answers;
};

const fresh = async (id: string) =>
  (await db().query.applications.findFirst({ where: eq(schema.applications.id, id) }))!;

async function act(action: RuleAction, ctx: Ctx): Promise<string> {
  const { ws, app, opp, stage, modules } = ctx;
  switch (action.type) {
    case "send_message": {
      // Outcome messages go out when decisions are released, never on a move.
      if (isFinal(stage.category)) return "skipped:released_later";
      const t = modules.messages?.templates.find((x) => x.id === action.templateId);
      if (!t || modules.messages?.enabled === false) return "skipped:no_template";
      return emailCandidate(ws, app, opp, { subject: t.subject, body: t.body });
    }
    case "notify_team": {
      const people =
        action.who === "assigned_reviewers"
          ? await db()
              .selectDistinct({ userId: schema.reviewAssignments.reviewerUserId })
              .from(schema.reviewAssignments)
              .where(
                and(
                  eq(schema.reviewAssignments.applicationId, app.id),
                  ne(schema.reviewAssignments.status, "declined"),
                ),
              )
          : await db()
              .select({ userId: schema.opportunityMembers.userId })
              .from(schema.opportunityMembers)
              .where(
                and(
                  eq(schema.opportunityMembers.opportunityId, opp.id),
                  eq(schema.opportunityMembers.role, "coordinator"),
                ),
              );
      for (const p of people)
        await notify(ws, p.userId, {
          kind: "automation",
          title: `${opp.title}: ${stage.name}`,
          body: action.text.slice(0, 300),
          link: `/admin/hiring/opportunities/${opp.id}?application=${app.id}`,
          dedupeKey: `rule:${ctx.run.id}:${p.userId}`,
        });
      return people.length ? "done" : "skipped:nobody";
    }
    case "add_tag": {
      // Fresh: an earlier action of this rule may have written tags or flags.
      const app = await fresh(ctx.app.id);
      const tag = action.tag.trim().toLowerCase().slice(0, 40);
      if (!tag || app.tags.includes(tag)) return "skipped:already";
      await db()
        .update(schema.applications)
        .set({ tags: [...app.tags, tag].slice(0, 20) })
        .where(eq(schema.applications.id, app.id));
      return "done";
    }
    case "route": {
      const app = await fresh(ctx.app.id);
      const routing = modules.routing;
      if (!routing || routing.enabled === false) return "skipped:off";
      const tags = [...app.tags];
      const flags = [...app.flags];
      for (const [i, r] of routing.rules.entries()) {
        if (
          !evaluate(
            { match: r.match, conditions: r.conditions } as Parameters<typeof evaluate>[0],
            ctx.answers,
          )
        )
          continue;
        const tag = "tag" in r.to ? r.to.tag : null;
        const flag = "flag" in r.to ? r.to.flag : null;
        if (tag && !tags.includes(tag)) tags.push(tag);
        if (flag && !flags.some((f) => f.requirement === flag))
          flags.push({
            kind: "requirement",
            requirement: flag,
            ruleId: `${ctx.rule.id}:${i}`,
            at: new Date().toISOString(),
          });
      }
      await db()
        .update(schema.applications)
        .set({ tags: tags.slice(0, 20), flags })
        .where(eq(schema.applications.id, app.id));
      return "done";
    }
    case "move_to_stage": {
      if (ctx.run.depth + 1 >= MAX_DEPTH) return "skipped:loop";
      const to = await db().query.pipelineStages.findFirst({
        where: and(
          eq(schema.pipelineStages.pipelineId, stage.pipelineId),
          eq(schema.pipelineStages.key, action.stageKey),
          isNull(schema.pipelineStages.archivedAt),
        ),
      });
      if (!to) return "skipped:unknown_stage";
      // Rules never decide (ADR 0002), whatever happened to the stage since the rule was saved.
      if (isFinal(to.category)) return "skipped:outcome";
      const current = await db().query.applications.findFirst({
        where: eq(schema.applications.id, app.id),
      });
      if (!current || current.stageId === to.id) return "skipped:same_stage";
      if (current.state !== "active") return "skipped:inactive";
      const from = current.stageId
        ? await db().query.pipelineStages.findFirst({
            where: eq(schema.pipelineStages.id, current.stageId),
          })
        : null;
      if (leaveProblem(from ?? null)) return "skipped:decided";
      const moved = await moveOne(
        ws.id,
        opp,
        current,
        from ?? null,
        to,
        { actorType: "rule", actorId: ctx.rule.id, depth: ctx.run.depth + 1 },
        SYSTEM_ACTOR(`rule:${ctx.rule.id}`),
      );
      // Someone moved them between the read and the write.
      return moved ? "done" : "skipped:raced";
    }
    default:
      // Reviews (H4), booking links (H5), follow-up forms, payments, folders and tasks.
      return "skipped:not_yet";
  }
}
