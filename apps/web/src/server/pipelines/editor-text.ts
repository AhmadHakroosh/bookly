import type { RuleAction, StageRule } from "@bookly/db/schema";
import type { ConditionGroup } from "@bookly/forms";
import type { ModuleConfig, StageModuleConfigs } from "./modules";

/*
 * The automations editor speaks in actions people recognise ("send an email", "create the
 * checklist"); rules store ADR 0002 actions that point at the stage's module config (its message
 * templates, checklist, booking sessions, payment). These two pure functions translate between
 * them, so the editor never handles template ids or session indexes.
 */

export type EditorAction =
  | { kind: "email"; templateId?: string; subject: string; body: string; transactional: boolean }
  | { kind: "tasks"; items: { title: string; dueDays: number | null }[] }
  | { kind: "booking_link"; eventTypeId: string }
  | { kind: "form"; formId: string }
  | { kind: "payment"; amount: number; currency: string; description: string }
  | { kind: "move"; stageKey: string }
  | { kind: "tag"; tag: string }
  | { kind: "notify"; text: string };

export type EditorRule = {
  name: string;
  on: "enter" | "leave";
  delayHours: number;
  /** Only for contacts with this tag (empty: everyone). */
  tag: string;
  actions: EditorAction[];
};

const newId = (taken: Set<string>) => {
  let id = "";
  do id = `t_${Math.random().toString(36).slice(2, 8)}`;
  while (taken.has(id) || id.length < 8);
  return id;
};

/**
 * An editor rule as stored: the rule's trigger, conditions and actions, and the stage's modules
 * with the templates, checklist, sessions and payment it needs. Templates no other rule on the
 * stage uses (`keepTemplates`) and that this rule no longer sends are dropped.
 */
export function fromEditor(
  draft: EditorRule,
  current: StageModuleConfigs,
  keepTemplates: Set<string>,
): {
  rule: {
    name: string;
    trigger: { on: "enter" | "leave" };
    conditions: ConditionGroup | null;
    delayMinutes: number;
    actions: RuleAction[];
  };
  modules: StageModuleConfigs;
} {
  const modules: StageModuleConfigs = structuredClone(current);
  const actions: RuleAction[] = [];
  const sent = new Set<string>();
  for (const a of draft.actions) {
    switch (a.kind) {
      case "email": {
        const m: ModuleConfig<"messages"> = modules.messages ?? {
          v: 1,
          enabled: true,
          templates: [],
        };
        const id =
          a.templateId && m.templates.some((t) => t.id === a.templateId)
            ? a.templateId
            : newId(new Set(m.templates.map((t) => t.id)));
        const template = {
          id,
          name: a.subject.trim().slice(0, 120) || "Email",
          channel: "email" as const,
          subject: a.subject.trim(),
          body: a.body.trim(),
          transactional: a.transactional,
        };
        m.templates = m.templates.some((t) => t.id === id)
          ? m.templates.map((t) => (t.id === id ? template : t))
          : [...m.templates, template];
        modules.messages = { ...m, enabled: true };
        actions.push({ type: "send_message", templateId: id });
        sent.add(id);
        break;
      }
      case "tasks":
        modules.tasks = {
          v: 1,
          enabled: true,
          checklist: a.items
            .filter((i) => i.title.trim())
            .map((i) => ({
              title: i.title.trim(),
              assignee:
                modules.tasks?.checklist.find((c) => c.title === i.title.trim())?.assignee ??
                "coordinator",
              dueDays: i.dueDays,
            })),
        };
        actions.push({ type: "create_tasks" });
        break;
      case "booking_link": {
        const s: ModuleConfig<"scheduling"> = modules.scheduling ?? {
          v: 1,
          enabled: true,
          sessions: [],
        };
        // Sessions are append-only: other rules point at them by position.
        let index = s.sessions.findIndex((x) => x.eventTypeId === a.eventTypeId);
        if (index < 0) {
          s.sessions = [
            ...s.sessions,
            { eventTypeId: a.eventTypeId, mode: "self_schedule", hosts: "pool" },
          ];
          index = s.sessions.length - 1;
        }
        modules.scheduling = { ...s, enabled: true };
        actions.push({ type: "send_booking_link", sessionIndex: index });
        break;
      }
      case "form":
        actions.push({ type: "request_form", formId: a.formId });
        break;
      case "payment":
        modules.payments = {
          v: 1,
          enabled: true,
          amountCents: Math.round(a.amount * 100),
          currency: a.currency.toLowerCase(),
          kind: "fee",
          waivable: false,
          description: a.description.trim(),
        };
        actions.push({ type: "request_payment" });
        break;
      case "move":
        actions.push({ type: "move_to_stage", stageKey: a.stageKey });
        break;
      case "tag":
        actions.push({ type: "add_tag", tag: a.tag.trim().toLowerCase() });
        break;
      case "notify":
        actions.push({ type: "notify_team", who: "coordinators", text: a.text.trim() });
        break;
    }
  }
  if (modules.messages)
    modules.messages.templates = modules.messages.templates.filter(
      (t) => sent.has(t.id) || keepTemplates.has(t.id),
    );
  const tag = draft.tag.trim().toLowerCase();
  return {
    rule: {
      name: draft.name.trim(),
      trigger: { on: draft.on },
      conditions: tag
        ? { match: "all", conditions: [{ fieldId: "tags", op: "equals", value: tag }] }
        : null,
      delayMinutes: Math.round(draft.delayHours * 60),
      actions,
    },
    modules,
  };
}

/** A stored rule as the editor shows it. */
export function toEditor(
  rule: Pick<StageRule, "name" | "trigger" | "conditions" | "delayMinutes" | "actions">,
  modules: StageModuleConfigs,
): EditorRule {
  const tagCondition = rule.conditions?.conditions.find((c) => c.fieldId === "tags");
  const actions: EditorAction[] = [];
  for (const a of rule.actions) {
    switch (a.type) {
      case "send_message": {
        const t = modules.messages?.templates.find((x) => x.id === a.templateId);
        actions.push({
          kind: "email",
          templateId: a.templateId,
          subject: t?.subject ?? "",
          body: t?.body ?? "",
          transactional: !!t?.transactional,
        });
        break;
      }
      case "create_tasks":
        actions.push({
          kind: "tasks",
          items: (modules.tasks?.checklist ?? []).map((c) => ({
            title: c.title,
            dueDays: c.dueDays,
          })),
        });
        break;
      case "send_booking_link":
        actions.push({
          kind: "booking_link",
          eventTypeId: modules.scheduling?.sessions[a.sessionIndex]?.eventTypeId ?? "",
        });
        break;
      case "request_form":
        actions.push({ kind: "form", formId: a.formId });
        break;
      case "request_payment":
        actions.push({
          kind: "payment",
          amount: (modules.payments?.amountCents ?? 0) / 100,
          currency: modules.payments?.currency ?? "usd",
          description: modules.payments?.description ?? "",
        });
        break;
      case "move_to_stage":
        actions.push({ kind: "move", stageKey: a.stageKey });
        break;
      case "add_tag":
        actions.push({ kind: "tag", tag: a.tag });
        break;
      case "notify_team":
        actions.push({ kind: "notify", text: a.text });
        break;
    }
  }
  return {
    name: rule.name,
    on: rule.trigger.on === "leave" ? "leave" : "enter",
    delayHours: rule.delayMinutes / 60,
    tag: typeof tagCondition?.value === "string" ? tagCondition.value : "",
    actions,
  };
}

/** One line per action, for the list of a stage's automations. */
export function describeAction(
  a: EditorAction,
  names: {
    stages: Map<string, string>;
    eventTypes: Map<string, string>;
    forms: Map<string, string>;
  },
): string {
  switch (a.kind) {
    case "email":
      return `Email "${a.subject || "no subject"}"`;
    case "tasks":
      return `Create ${a.items.length} task${a.items.length === 1 ? "" : "s"}`;
    case "booking_link":
      return `Send a link to book ${names.eventTypes.get(a.eventTypeId) ?? "a meeting"}`;
    case "form":
      return `Ask to fill in ${names.forms.get(a.formId) ?? "a form"}`;
    case "payment":
      return `Request ${a.amount.toFixed(2)} ${a.currency.toUpperCase()}`;
    case "move":
      return `Move to ${names.stages.get(a.stageKey) ?? a.stageKey}`;
    case "tag":
      return `Tag "${a.tag}"`;
    case "notify":
      return `Tell owners and admins: ${a.text}`;
  }
}
