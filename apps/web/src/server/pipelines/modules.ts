import { z } from "zod";
import type { RuleActionType } from "@bookly/db/schema";

/**
 * The stage module registry (ADR 0002): a closed set of module kinds, each with the config it
 * keeps on a stage (`pipeline_stages.modules[kind]`), the rule actions it contributes and the
 * events rules can wait for. Pure, so the editor, the rule engine and tests share it. Adding a
 * kind is a code change reviewed against the ADR; a new program shape never is.
 */

export const MODULE_KINDS = [
  "forms",
  "reviews",
  "scheduling",
  "video",
  "messages",
  "tasks",
  "files",
  "payments",
  "routing",
  "decisions",
] as const;
export type ModuleKind = (typeof MODULE_KINDS)[number];
export type Subject = "contact" | "application";

const id = z.string().min(1).max(80);
const enabled = { enabled: z.boolean().default(true) };

const configs = {
  forms: z.object({
    v: z.literal(1),
    ...enabled,
    forms: z
      .array(
        z.object({
          formId: id,
          audience: z.enum(["subject", "reviewer", "reference"]).default("subject"),
          required: z.boolean().default(false),
        }),
      )
      .max(20)
      .default([]),
  }),
  reviews: z.object({
    v: z.literal(1),
    ...enabled,
    scorecardId: id.nullable().default(null),
    reviewersPerApplication: z.number().int().min(1).max(20).default(2),
    assignment: z.enum(["manual", "round_robin", "whole_pool", "routing"]).default("manual"),
    poolUserIds: z.array(id).max(200).default([]),
    interviewersReview: z.boolean().default(false),
    dueDays: z.number().int().min(1).max(90).nullable().default(null),
  }),
  scheduling: z.object({
    v: z.literal(1),
    ...enabled,
    sessions: z
      .array(
        z.object({
          eventTypeId: id,
          mode: z.enum(["self_schedule", "coordinator", "group_session"]).default("self_schedule"),
          hosts: z
            .union([z.enum(["assigned_reviewers", "pool"]), z.array(id).max(50)])
            .default("pool"),
        }),
      )
      .max(10)
      .default([]),
  }),
  video: z.object({
    v: z.literal(1),
    ...enabled,
    autoCapture: z.enum(["off", "ask", "always"]).optional(),
  }),
  messages: z.object({
    v: z.literal(1),
    ...enabled,
    templates: z
      .array(
        z.object({
          id,
          name: z.string().trim().min(1).max(120),
          channel: z.enum(["email", "sms"]).default("email"),
          subject: z.string().trim().max(200).default(""),
          body: z.string().trim().min(1).max(8000),
          /**
           * Transactional messages (status, scheduling, payment) go even to people who opted
           * out of marketing email; everything else honours the opt-out.
           */
          transactional: z.boolean().default(false),
        }),
      )
      .max(30)
      .default([]),
  }),
  tasks: z.object({
    v: z.literal(1),
    ...enabled,
    checklist: z
      .array(
        z.object({
          title: z.string().trim().min(1).max(200),
          /** Who gets it: the rule's author, the stage owner or a member by id. */
          assignee: z.union([z.enum(["coordinator", "stage_owner"]), id]).default("coordinator"),
          dueDays: z.number().int().min(0).max(365).nullable().default(null),
        }),
      )
      .max(30)
      .default([]),
  }),
  files: z.object({
    v: z.literal(1),
    ...enabled,
    required: z
      .array(
        z.object({
          label: z.string().trim().min(1).max(120),
          accept: z.array(z.string().max(100)).max(20).default([]),
          maxMb: z.number().positive().max(25).default(10),
        }),
      )
      .max(20)
      .default([]),
    folder: z.enum(["per_subject", "per_cohort"]).nullable().default("per_subject"),
  }),
  payments: z.object({
    v: z.literal(1),
    ...enabled,
    amountCents: z.number().int().min(50).max(10_000_000),
    currency: z.string().length(3).toLowerCase(),
    kind: z.enum(["fee", "deposit"]).default("fee"),
    waivable: z.boolean().default(false),
    description: z.string().trim().max(200).default(""),
  }),
  routing: z.object({
    v: z.literal(1),
    ...enabled,
    rules: z
      .array(
        z.object({
          match: z.enum(["all", "any"]),
          conditions: z
            .array(
              z.object({
                fieldId: id,
                op: z.string().max(20),
                value: z.union([z.string().max(500), z.number(), z.array(z.string())]).optional(),
              }),
            )
            .max(20),
          to: z.union([
            z.object({ stage: z.string().max(40) }),
            z.object({ tag: z.string().max(40) }),
            z.object({ cohort: id }),
            z.object({ reviewerPool: z.array(id).max(50) }),
            z.object({ flag: z.string().max(200) }),
          ]),
        }),
      )
      .max(30)
      .default([]),
  }),
  decisions: z.object({
    v: z.literal(1),
    ...enabled,
    outcomes: z.array(z.string().max(40)).max(10).default([]),
    targets: z.record(z.string(), z.string().max(40)).default({}),
    batch: z.boolean().default(false),
    meetingEventTypeId: id.nullable().default(null),
    templates: z.record(z.string(), id).default({}),
  }),
} satisfies Record<ModuleKind, z.ZodType>;

export type ModuleConfig<K extends ModuleKind> = z.infer<(typeof configs)[K]>;
export type StageModuleConfigs = Partial<{ [K in ModuleKind]: ModuleConfig<K> }>;

type ModuleDefinition = {
  kind: ModuleKind;
  label: string;
  subjects: readonly Subject[];
  actions: readonly RuleActionType[];
  events: readonly string[];
};

export const MODULES: Record<ModuleKind, ModuleDefinition> = {
  forms: {
    kind: "forms",
    label: "Forms",
    subjects: ["contact", "application"],
    actions: ["request_form"],
    events: ["form.submitted"],
  },
  reviews: {
    kind: "reviews",
    label: "Reviews",
    subjects: ["application"],
    actions: ["assign_reviewers"],
    events: ["review.submitted", "review.all_submitted"],
  },
  scheduling: {
    kind: "scheduling",
    label: "Scheduling",
    subjects: ["contact", "application"],
    actions: ["send_booking_link"],
    events: ["booking.created", "booking.completed", "booking.no_show"],
  },
  video: {
    kind: "video",
    label: "Video and capture",
    subjects: ["contact", "application"],
    actions: [],
    events: ["meeting.captured"],
  },
  messages: {
    kind: "messages",
    label: "Messages",
    subjects: ["contact", "application"],
    actions: ["send_message"],
    events: ["message.replied"],
  },
  tasks: {
    kind: "tasks",
    label: "Tasks",
    subjects: ["contact", "application"],
    actions: ["create_tasks"],
    events: ["tasks.all_done"],
  },
  files: {
    kind: "files",
    label: "Files",
    subjects: ["contact", "application"],
    actions: ["create_folder"],
    events: [],
  },
  payments: {
    kind: "payments",
    label: "Payments",
    subjects: ["contact", "application"],
    actions: ["request_payment"],
    events: ["payment.paid", "payment.waived"],
  },
  routing: {
    kind: "routing",
    label: "Routing",
    subjects: ["contact", "application"],
    actions: ["route"],
    events: [],
  },
  decisions: {
    kind: "decisions",
    label: "Decisions",
    subjects: ["application"],
    // Decisions are always made by people, never by a rule (ADR 0002, canon X1).
    actions: [],
    events: ["decision.made", "batch.finalized"],
  },
};

/** Actions every stage has, whatever its modules. */
export const CORE_ACTIONS = ["move_to_stage", "add_tag", "notify_team"] as const;

/** The module an action needs on the stage, or null for core actions. */
export function moduleOfAction(type: RuleActionType): ModuleKind | null {
  for (const m of Object.values(MODULES)) if (m.actions.includes(type)) return m.kind;
  return null;
}

/** The module kinds a pipeline of this subject may use (Reviews and Decisions are hiring-only). */
export const kindsFor = (subject: Subject) =>
  MODULE_KINDS.filter((k) => MODULES[k].subjects.includes(subject));

/**
 * A stage's stored modules, each checked against its schema. Invalid or unknown entries are
 * left out with the reason, so a run skips them instead of failing (ADR 0002).
 */
export function readModules(raw: unknown): { modules: StageModuleConfigs; problems: string[] } {
  const modules: StageModuleConfigs = {};
  const problems: string[] = [];
  if (!raw || typeof raw !== "object") return { modules, problems };
  for (const [kind, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!(MODULE_KINDS as readonly string[]).includes(kind)) {
      problems.push(`Unknown module "${kind}".`);
      continue;
    }
    const k = kind as ModuleKind;
    const parsed = configs[k].safeParse(value);
    if (parsed.success) (modules as Record<string, unknown>)[k] = parsed.data;
    else problems.push(`${MODULES[k].label}: ${parsed.error.issues[0]?.message ?? "invalid"}`);
  }
  return { modules, problems };
}

/** One module's config, checked: the value to store, or what is wrong with it. */
export function parseModule<K extends ModuleKind>(
  kind: K,
  raw: unknown,
): { config: ModuleConfig<K> } | { problem: string } {
  const r = configs[kind].safeParse(raw);
  return r.success
    ? { config: r.data as ModuleConfig<K> }
    : { problem: `${MODULES[kind].label}: ${r.error.issues[0]?.message ?? "invalid"}` };
}
