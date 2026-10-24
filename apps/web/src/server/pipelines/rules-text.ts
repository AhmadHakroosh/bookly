import { CONDITION_OPS, type Answers, type ConditionGroup } from "@bookly/forms";
import type { RuleAction, RuleTrigger } from "@bookly/db/schema";
import {
  CORE_ACTIONS,
  MODULES,
  kindsFor,
  moduleOfAction,
  type StageModuleConfigs,
  type Subject,
} from "./modules";

/*
 * Stage rules without the database (ADR 0002): what a valid rule is, which events it may wait
 * for, the loop guard, the retry schedule and the facts conditions read. The engine in
 * `rules.ts` and the editor both use these.
 */

/** A rule-driven move deeper than this is refused: rules moving people back and forth. */
export const MAX_DEPTH = 5;
/** Minutes before each retry of a failed run (as webhook deliveries); then it fails for good. */
export const RETRY_MINUTES = [1, 5, 30, 120, 720] as const;
/** The longest delay a rule may wait before it runs. */
export const MAX_DELAY_MINUTES = 7 * 24 * 60;

/** Events a rule on a stage of this subject can wait for: those of the modules it may use. */
export const eventsFor = (subject: Subject) =>
  kindsFor(subject).flatMap((k) => MODULES[k].events as readonly string[]);

export type RuleDraft = {
  name: string;
  trigger: RuleTrigger;
  conditions: ConditionGroup | null;
  actions: RuleAction[];
  delayMinutes: number;
};

/**
 * What is wrong with a rule on a stage, in plain words (empty when it is fine). `stageKeys` are
 * the pipeline's live stage keys; `stageKey` is the rule's own stage.
 */
export function ruleProblems(
  rule: RuleDraft,
  ctx: {
    subject: Subject;
    stageKey: string;
    stageKeys: string[];
    modules: StageModuleConfigs;
  },
): string[] {
  const out: string[] = [];
  if (!rule.name.trim()) out.push("Give the automation a name.");
  if (rule.name.length > 120) out.push("Keep the name under 120 characters.");
  const t = rule.trigger;
  if (t.on === "idle") out.push("Rules that wait for time in a stage arrive in 1.1.");
  else if (t.on === "event" && !eventsFor(ctx.subject).includes(t.event))
    out.push(`Unknown event "${t.event}".`);
  else if (!["enter", "leave", "event"].includes(t.on)) out.push("Choose when it runs.");
  if (!Number.isInteger(rule.delayMinutes) || rule.delayMinutes < 0)
    out.push("The delay must be whole minutes.");
  else if (rule.delayMinutes > MAX_DELAY_MINUTES) out.push("Wait at most 7 days.");
  for (const c of rule.conditions?.conditions ?? [])
    if (!(CONDITION_OPS as readonly string[]).includes(c.op))
      out.push(`Unknown comparison "${c.op}".`);
  if (!rule.actions.length) out.push("Add at least one action.");
  if (rule.actions.length > 20) out.push("At most 20 actions in one automation.");
  const allowed = new Set<string>([
    ...CORE_ACTIONS,
    ...kindsFor(ctx.subject).flatMap((k) => MODULES[k].actions),
  ]);
  const m = ctx.modules;
  rule.actions.forEach((a, i) => {
    const n = `Action ${i + 1}`;
    if (!allowed.has(a.type)) {
      out.push(`${n}: not available on this pipeline.`);
      return;
    }
    const kind = moduleOfAction(a.type);
    if (kind && m[kind]?.enabled === false) out.push(`${n}: ${MODULES[kind].label} is off here.`);
    switch (a.type) {
      case "send_message":
        if (!m.messages?.templates.some((x) => x.id === a.templateId))
          out.push(`${n}: the message is missing.`);
        break;
      case "send_booking_link":
        if (!m.scheduling?.sessions[a.sessionIndex]) out.push(`${n}: choose what to book.`);
        break;
      case "request_form":
        if (!a.formId) out.push(`${n}: choose a form.`);
        break;
      case "create_tasks":
        if (!m.tasks?.checklist.length) out.push(`${n}: the checklist is empty.`);
        break;
      case "request_payment":
        if (!m.payments) out.push(`${n}: set the amount.`);
        break;
      case "route":
        if (!m.routing?.rules.length) out.push(`${n}: add routing rules.`);
        break;
      case "move_to_stage":
        if (a.stageKey === ctx.stageKey)
          out.push(`${n}: an automation cannot move people into its own stage.`);
        else if (!ctx.stageKeys.includes(a.stageKey)) out.push(`${n}: unknown stage.`);
        break;
      case "add_tag":
        if (!a.tag.trim() || a.tag.length > 40) out.push(`${n}: a tag of 1 to 40 characters.`);
        break;
      case "notify_team":
        if (!a.text.trim()) out.push(`${n}: write what to tell the team.`);
        if (a.text.length > 500) out.push(`${n}: keep it under 500 characters.`);
        if (ctx.subject === "contact" && a.who !== "coordinators")
          out.push(`${n}: client pipelines notify owners and admins.`);
        break;
    }
  });
  return out;
}

/** When the next attempt of a run that failed `attempts` times is due, or null to give up. */
export function retryAt(attempts: number, now = new Date()): Date | null {
  const m = RETRY_MINUTES[attempts - 1];
  return m === undefined ? null : new Date(now.getTime() + m * 60_000);
}

/** How many actions a retry skips: those already done or skipped, in order. */
export function resumeFrom(results: string[]): number {
  let i = 0;
  while (i < results.length && (results[i] === "done" || results[i]!.startsWith("skipped:"))) i++;
  return i;
}

/** What conditions are evaluated against for a contact: its tags, stage and a few fields. */
export function contactFacts(c: {
  tags: string[];
  email: string;
  company: string | null;
  stageKey: string;
}): Answers {
  return {
    tags: c.tags,
    stage: c.stageKey,
    company: c.company ?? "",
    email_domain: c.email.split("@")[1] ?? "",
  };
}

/** The placeholders a stage message fills, on top of those of templated outreach. */
export function fillPlaceholders(text: string, values: Record<string, string>) {
  return text.replace(/\{(\w+)\}/g, (m, k: string) => values[k] ?? m);
}
