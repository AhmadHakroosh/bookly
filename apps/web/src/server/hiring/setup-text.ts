import type { ConditionGroup, FormSchema } from "@bookly/forms";
import type {
  OpportunityRole,
  OpportunityStatus,
  OpportunityType,
  RuleAction,
  RuleTrigger,
  StageCategory,
} from "@bookly/db/schema";
import { MODULES, type ModuleKind, type StageModuleConfigs } from "../pipelines/modules";

/*
 * Opportunity setup without the database (planning/v2/ux/opportunity-setup.md): the pipeline
 * validity rules, the publish checklist, the applicant Journey with its warnings, the default
 * candidate-facing labels and the one-line module summaries. The wizard, the server actions and
 * the tests all read these, so what the editor shows and what publish enforces never drift.
 */

export const SETUP_STEPS = ["basics", "stages", "team", "privacy", "publish"] as const;
export type SetupStep = (typeof SETUP_STEPS)[number];
export const STEP_LABELS: Record<"start" | SetupStep, string> = {
  start: "Start",
  basics: "Basics",
  stages: "Stages",
  team: "Team",
  privacy: "Privacy",
  publish: "Publish",
};

export const STAGE_LIMITS = { max: 15, nameMax: 40 } as const;

export const CATEGORY_LABELS: Record<StageCategory, string> = {
  open: "Open",
  hold: "Hold",
  won: "Won",
  lost: "Lost",
};

/** Final stages: an application reaches one only when a person decides (`decisions.md`). */
export const isFinal = (c: StageCategory) => c !== "open";

export type SetupRule = {
  id?: string;
  name: string;
  trigger: RuleTrigger;
  conditions?: ConditionGroup | null;
  actions: RuleAction[];
  active: boolean;
  delayMinutes?: number;
};

export type SetupStage = {
  id: string;
  key: string;
  name: string;
  category: StageCategory;
  isEntry: boolean;
  isWaitlist: boolean;
  /** Candidate-facing label as saved; null = the default for the stage. */
  label: string | null;
  modules: StageModuleConfigs;
  rules: SetupRule[];
  /** Applications in the stage now (edit after publish). */
  applications: number;
};

export type SetupBasics = {
  title: string;
  type: OpportunityType;
  status: OpportunityStatus;
  cohortName: string | null;
  opensAt: Date | null;
  closesAt: Date | null;
  decidesBy: Date | null;
  capacity: number | null;
  timezone: string;
  slug: string;
};

/* ---------------- Labels ---------------- */

/** What applicants see for a stage when the coordinator wrote nothing (spec: default labels). */
export function defaultLabel(stage: Pick<SetupStage, "category" | "isEntry" | "isWaitlist">) {
  if (stage.isEntry) return "Submitted";
  switch (stage.category) {
    case "open":
      return "Under review";
    case "hold":
      // "Under review" is true while on an internal hold; the waitlist says what it is.
      return stage.isWaitlist ? "On the waitlist" : "Under review";
    case "won":
      return "Admitted";
    case "lost":
      return "Not selected";
  }
}

export const candidateLabel = (
  s: Pick<SetupStage, "label" | "category" | "isEntry" | "isWaitlist">,
) => s.label?.trim() || defaultLabel(s);

/* ---------------- Slugs and basics ---------------- */

export function slugify(title: string): string {
  return (
    title
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60)
      .replace(/-+$/, "") || "opportunity"
  );
}

export const isSlug = (s: string) => /^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/.test(s);

/** The first of `base`, `base-2`, `base-3`… not taken. */
export function nextSlug(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let i = 2; ; i++) {
    const s = `${base.slice(0, 60 - String(i).length - 1)}-${i}`;
    if (!used.has(s)) return s;
  }
}

/** A copy's title: "[Source title] (copy)". */
export const copyTitle = (title: string) =>
  `${title.replace(/ \(copy\)$/, "")} (copy)`.slice(0, 120);

export type BasicsInput = {
  title: string;
  cohortName: string;
  type: OpportunityType;
  opensAt: Date | null;
  closesAt: Date | null;
  decidesBy: Date | null;
  capacity: number | null;
  timezone: string;
  slug: string;
};

/** Field errors for Basics, keyed by field; empty when it can be saved. */
export function basicsProblems(b: BasicsInput): Partial<Record<keyof BasicsInput, string>> {
  const out: Partial<Record<keyof BasicsInput, string>> = {};
  if (!b.title.trim()) out.title = "Give the opportunity a title.";
  else if (b.title.length > 120) out.title = "Keep the title under 120 characters.";
  if (b.cohortName.length > 80) out.cohortName = "Keep the cohort under 80 characters.";
  if (!isSlug(b.slug))
    out.slug =
      "Use lowercase letters, numbers and dashes, starting and ending with a letter or number.";
  if (b.opensAt && b.closesAt && b.closesAt <= b.opensAt)
    out.closesAt = "Applications must close after they open.";
  if (b.closesAt && b.decidesBy && b.decidesBy < b.closesAt)
    out.decidesBy = "Decide after applications close.";
  if (
    b.capacity !== null &&
    (!Number.isInteger(b.capacity) || b.capacity < 1 || b.capacity > 100_000)
  )
    out.capacity = "Seats is a whole number from 1 to 100,000.";
  if (!isTimeZone(b.timezone)) out.timezone = "Choose a time zone.";
  return out;
}

export function isTimeZone(tz: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return !!tz;
  } catch {
    return false;
  }
}

/* ---------------- Pipeline validity ---------------- */

export type Problem = {
  code:
    | "stage_count"
    | "stage_name"
    | "no_entry"
    | "entry_first"
    | "entry_forms"
    | "no_won"
    | "no_lost"
    | "final_stage_without_message"
    | "rule_decides"
    | "routing_rejects"
    | "invalid_rule";
  message: string;
  stageKey?: string;
  module?: ModuleKind;
};

const formsOn = (m: StageModuleConfigs) =>
  m.forms?.enabled !== false && !!m.forms?.forms.some((f) => f.audience === "subject");

/** The stage has an email that reaches the applicant (on a final stage: at decision release). */
export const hasCandidateMessage = (s: Pick<SetupStage, "modules">) =>
  s.modules.messages?.enabled !== false && (s.modules.messages?.templates.length ?? 0) > 0;

/** What a rule may not do on a hiring pipeline (ADR 0002 guardrails). Null when allowed. */
export function hiringRuleProblem(
  action: RuleAction,
  stage: Pick<SetupStage, "category">,
  stages: Pick<SetupStage, "key" | "category">[],
): string | null {
  if (action.type === "move_to_stage") {
    const to = stages.find((s) => s.key === action.stageKey);
    if (to && isFinal(to.category))
      return "Rules can't move applications to an outcome. People decide outcomes in Bookly.";
  }
  if (action.type === "send_message" && isFinal(stage.category))
    return "Messages on outcomes are sent when you release decisions, not by a rule.";
  return null;
}

/**
 * Everything that keeps a pipeline from being published (rules 1–6 of the spec), in stage
 * order. Each names the stage and module to open, so the editor and the checklist link there.
 */
export function pipelineProblems(stages: SetupStage[]): Problem[] {
  const out: Problem[] = [];
  if (stages.length > STAGE_LIMITS.max)
    out.push({ code: "stage_count", message: `Use at most ${STAGE_LIMITS.max} stages.` });
  const seen = new Set<string>();
  for (const s of stages) {
    const name = s.name.trim();
    if (!name || name.length > STAGE_LIMITS.nameMax)
      out.push({
        code: "stage_name",
        stageKey: s.key,
        message: `Stage names are 1 to ${STAGE_LIMITS.nameMax} characters.`,
      });
    else if (seen.has(name.toLowerCase()))
      out.push({ code: "stage_name", stageKey: s.key, message: `Two stages are called ${name}.` });
    seen.add(name.toLowerCase());
  }
  const entry = stages.find((s) => s.isEntry);
  if (!entry || entry.category !== "open")
    out.push({ code: "no_entry", message: "Add an open first stage where applications arrive." });
  else {
    if (stages[0]?.key !== entry.key)
      out.push({
        code: "entry_first",
        stageKey: entry.key,
        message: `${entry.name} receives applications, so it must come first.`,
      });
    if (!formsOn(entry.modules))
      out.push({
        code: "entry_forms",
        stageKey: entry.key,
        module: "forms",
        message: `${entry.name} needs the application form.`,
      });
  }
  if (!stages.some((s) => s.category === "won"))
    out.push({ code: "no_won", message: "Add a won stage, such as Admitted." });
  if (!stages.some((s) => s.category === "lost"))
    out.push({ code: "no_lost", message: "Add a lost stage, such as Not selected." });
  for (const s of stages) {
    if (isFinal(s.category) && !hasCandidateMessage(s))
      out.push({
        code: "final_stage_without_message",
        stageKey: s.key,
        module: "messages",
        message: `Applicants who reach ${s.name} won't hear from you. Add a message to publish.`,
      });
    for (const r of s.rules)
      for (const a of r.actions) {
        const p = hiringRuleProblem(a, s, stages);
        if (p) out.push({ code: "rule_decides", stageKey: s.key, message: `${r.name}: ${p}` });
        else if (a.type === "move_to_stage" && !stages.some((x) => x.key === a.stageKey))
          out.push({
            code: "invalid_rule",
            stageKey: s.key,
            message: `${r.name}: the stage it moves applications to was removed.`,
          });
      }
    for (const r of s.modules.routing?.rules ?? [])
      if ("stage" in r.to) {
        const to = stages.find((x) => x.key === (r.to as { stage: string }).stage);
        if (!to || isFinal(to.category))
          out.push({
            code: "routing_rejects",
            stageKey: s.key,
            module: "routing",
            message: "Routing can flag an application for a person, never move it to an outcome.",
          });
      }
  }
  return out;
}

/** An application form has a required name and email question (publish checklist). */
export function formHasNameAndEmail(schema: FormSchema | null): boolean {
  if (!schema) return false;
  const req = schema.fields.filter((f) => f.required);
  return (
    req.some((f) => f.type === "email") &&
    req.some((f) => f.type === "short_text" && (f.id === "name" || /name/i.test(f.label)))
  );
}

/* ---------------- Publish checklist ---------------- */

export type ChecklistItem = {
  id:
    | "pipeline_valid"
    | "form_name_email"
    | "final_stage_messages"
    | "privacy_notice"
    | "dates"
    | "coordinator";
  label: string;
  ok: boolean;
  /** What to fix, when not ok. */
  detail?: string;
  step: SetupStep;
  stageKey?: string;
  module?: ModuleKind;
};

export function publishChecklist(input: {
  basics: SetupBasics;
  stages: SetupStage[];
  form: FormSchema | null;
  privacyNotice: string;
  coordinators: number;
}): ChecklistItem[] {
  const problems = pipelineProblems(input.stages);
  const structural = problems.filter((p) => p.code !== "final_stage_without_message");
  const silent = problems.filter((p) => p.code === "final_stage_without_message");
  const missingDates = [
    !input.basics.closesAt && "when applications close",
    !input.basics.decidesBy && "the decisions-by date",
  ].filter(Boolean);
  return [
    {
      id: "pipeline_valid",
      label: "The pipeline is valid",
      ok: !structural.length,
      detail: structural[0]?.message,
      step: "stages",
      stageKey: structural[0]?.stageKey,
      module: structural[0]?.module,
    },
    {
      id: "form_name_email",
      label: "The application form asks for name and email",
      ok: formHasNameAndEmail(input.form),
      detail: "Add required name and email questions to the application form.",
      step: "stages",
      stageKey: input.stages.find((s) => s.isEntry)?.key,
      module: "forms",
    },
    {
      id: "final_stage_messages",
      label: "Every outcome has a message",
      ok: !silent.length,
      detail: silent[0]?.message,
      step: "stages",
      stageKey: silent[0]?.stageKey,
      module: "messages",
    },
    {
      id: "privacy_notice",
      label: "A privacy notice is shown to applicants",
      ok: !!input.privacyNotice.trim(),
      detail: "Add the privacy notice applicants read before they apply.",
      step: "privacy",
    },
    {
      id: "dates",
      label: "Dates are set",
      ok: !missingDates.length,
      detail: `Set ${missingDates.join(" and ")}.`,
      step: "basics",
    },
    {
      id: "coordinator",
      label: "At least one coordinator",
      ok: input.coordinators > 0,
      detail: "Name a coordinator on the team.",
      step: "team",
    },
  ];
}

/** Which steps need work, for the step rail. */
export function stepStatus(items: ChecklistItem[], basics: SetupBasics) {
  const bad = (step: SetupStep) => items.some((i) => !i.ok && i.step === step);
  return {
    start: "done",
    basics: !basics.title.trim() || bad("basics") ? "needs_work" : "done",
    stages: bad("stages") ? "needs_work" : "done",
    team: bad("team") ? "needs_work" : "done",
    privacy: bad("privacy") ? "needs_work" : "done",
    publish: items.every((i) => i.ok) ? "done" : "needs_work",
  } as Record<"start" | SetupStep, "done" | "needs_work">;
}

/* ---------------- The Journey ---------------- */

export type Touchpoint =
  | { kind: "email"; subject: string; body: string; when: "enter" | "leave" | "release" }
  | { kind: "action"; text: string };

export type JourneyWarning = { tone: "blocking" | "advice"; stageKey?: string; text: string };

export type JourneyStage = {
  key: string;
  name: string;
  category: StageCategory;
  label: string;
  touchpoints: Touchpoint[];
};

const BOOKING_EMAIL = {
  subject: "Book your interview for {opportunity}",
  body: "Hi {name},\n\nWe'd like to meet you. Choose a time that suits you from the link below.",
};

/** What one stage shows and sends an applicant, in the order it happens. */
function touchpoints(s: SetupStage): Touchpoint[] {
  const out: Touchpoint[] = [];
  const m = s.modules;
  if (isFinal(s.category)) {
    if (m.messages?.enabled !== false)
      for (const t of m.messages?.templates ?? [])
        out.push({ kind: "email", subject: t.subject, body: t.body, when: "release" });
  } else {
    const ordered = [
      ...s.rules.filter((r) => r.trigger.on === "enter"),
      ...s.rules.filter((r) => r.trigger.on === "leave"),
    ];
    for (const r of ordered) {
      if (!r.active) continue;
      const when = r.trigger.on === "leave" ? "leave" : "enter";
      for (const a of r.actions) {
        if (a.type === "send_message") {
          const t = m.messages?.templates.find((x) => x.id === a.templateId);
          if (t) out.push({ kind: "email", subject: t.subject, body: t.body, when });
        } else if (a.type === "send_booking_link") {
          out.push({ kind: "email", ...BOOKING_EMAIL, when });
          out.push({ kind: "action", text: "Book a time" });
        } else if (a.type === "request_form") {
          const f = m.forms?.forms.find((x) => x.formId === a.formId);
          if (f?.audience !== "reference") out.push({ kind: "action", text: "Fill in a form" });
        } else if (a.type === "request_payment" && m.payments?.enabled !== false)
          out.push({
            kind: "action",
            text: m.payments?.kind === "deposit" ? "Pay the deposit" : "Pay the fee",
          });
      }
    }
  }
  if (m.files?.enabled !== false)
    for (const f of m.files?.required ?? [])
      out.push({ kind: "action", text: `Upload: ${f.label}` });
  return out;
}

const weeks = (days: number) => Math.ceil(days / 7);
const fmtDay = (d: Date, timeZone: string) =>
  new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone }).format(d);

/**
 * Every touchpoint an applicant can have, stage by stage, with the warnings of S6: an outcome
 * nobody hears about (blocking), a stage where people may wait more than a week in silence and
 * due dates that run past the promised decision date (advice).
 */
export function journey(
  stages: SetupStage[],
  basics: Pick<SetupBasics, "closesAt" | "decidesBy" | "timezone">,
): { stages: JourneyStage[]; warnings: JourneyWarning[]; emails: number } {
  const out: JourneyStage[] = stages.map((s) => ({
    key: s.key,
    name: s.name,
    category: s.category,
    label: candidateLabel(s),
    touchpoints: touchpoints(s),
  }));
  const warnings: JourneyWarning[] = [];
  for (const s of stages) {
    const j = out.find((x) => x.key === s.key)!;
    const emails = j.touchpoints.filter((t) => t.kind === "email").length;
    if (isFinal(s.category) && !emails)
      warnings.push({
        tone: "blocking",
        stageKey: s.key,
        text: `Applicants who reach ${s.name} won't hear from you. Add a message to publish.`,
      });
    const due = s.modules.reviews?.enabled !== false ? (s.modules.reviews?.dueDays ?? 0) : 0;
    if (!isFinal(s.category) && !s.isEntry && !emails && due > 7)
      warnings.push({
        tone: "advice",
        stageKey: s.key,
        text: `Applicants may wait in ${s.name} for up to ${weeks(due)} weeks without an update. Consider an update email.`,
      });
  }
  if (basics.closesAt && basics.decidesBy) {
    const days = stages
      .filter((s) => !isFinal(s.category) && s.modules.reviews?.enabled !== false)
      .reduce((n, s) => n + (s.modules.reviews?.dueDays ?? 0), 0);
    const end = new Date(basics.closesAt.getTime() + days * 86_400_000);
    if (days && end > basics.decidesBy)
      warnings.push({
        tone: "advice",
        text: `Decisions are promised by ${fmtDay(basics.decidesBy, basics.timezone)}. Your review and interview due dates end ${fmtDay(end, basics.timezone)}.`,
      });
  }
  const emails = out.reduce(
    (n, s) => n + s.touchpoints.filter((t) => t.kind === "email").length,
    0,
  );
  return { stages: out, warnings, emails };
}

/** "7 emails across 7 stages · every outcome has a message". */
export function journeySummary(j: ReturnType<typeof journey>) {
  const silent = j.warnings.filter((w) => w.tone === "blocking").length;
  const n = (k: number, w: string) => `${k} ${w}${k === 1 ? "" : "s"}`;
  return `${n(j.emails, "email")} across ${n(j.stages.length, "stage")} · ${
    silent ? `${n(silent, "outcome")} without a message` : "every outcome has a message"
  }`;
}

/** Fills a message's placeholders with what the preview knows. */
export function fillSample(
  text: string,
  values: { title: string; decidesBy: Date | null; timezone: string },
) {
  const map: Record<string, string> = {
    name: "Alex",
    opportunity: values.title || "this opportunity",
    decides_by: values.decidesBy
      ? fmtDay(values.decidesBy, values.timezone)
      : "[decisions-by date]",
  };
  return text.replace(/\{(\w+)\}/g, (m, k: string) => map[k] ?? m);
}

/* ---------------- Module rows ---------------- */

/** The one-line state of a module on a stage, for its row in the editor. */
export function moduleSummary(
  kind: ModuleKind,
  m: StageModuleConfigs,
  ctx: {
    stage: Pick<SetupStage, "category" | "isEntry">;
    criteria: (id: string | null) => number;
    eventTypes: Map<string, string>;
  },
): string {
  switch (kind) {
    case "forms": {
      const n = m.forms?.forms.length ?? 0;
      if (ctx.stage.isEntry) return "The application form";
      return n ? `${n} form${n === 1 ? "" : "s"} to fill in` : "No forms yet";
    }
    case "reviews": {
      const r = m.reviews!;
      const c = ctx.criteria(r.scorecardId);
      return [
        `${r.reviewersPerApplication} reviewer${r.reviewersPerApplication === 1 ? "" : "s"}`,
        `${c} criteri${c === 1 ? "on" : "a"}`,
        r.dueDays ? `due ${r.dueDays} days after entering` : "no due date",
      ].join(" · ");
    }
    case "scheduling": {
      const s = m.scheduling!;
      const names = s.sessions.map((x) => ctx.eventTypes.get(x.eventTypeId) ?? "An event type");
      if (names.length) return names.join(", ");
      return s.suggested
        ? `Choose an event type to send booking links (${s.suggested.minutes}-minute ${s.suggested.title.toLowerCase()})`
        : "Choose an event type to send booking links";
    }
    case "video":
      return m.video?.autoCapture === "always"
        ? "Capture every interview, with consent"
        : m.video?.autoCapture === "ask"
          ? "Ask before capturing"
          : "No capture";
    case "messages": {
      const n = m.messages?.templates.length ?? 0;
      const base = `${n} message${n === 1 ? "" : "s"}`;
      return isFinal(ctx.stage.category) ? `${base} · sent when you release decisions` : base;
    }
    case "tasks": {
      const n = m.tasks?.checklist.length ?? 0;
      return `${n} task${n === 1 ? "" : "s"} for the coordinator`;
    }
    case "files": {
      const n = m.files?.required.length ?? 0;
      return n ? `${n} required document${n === 1 ? "" : "s"}` : "A shared folder";
    }
    case "payments": {
      const p = m.payments!;
      return `${p.kind === "deposit" ? "Deposit" : "Application fee"} of ${(p.amountCents / 100).toFixed(2)} ${p.currency.toUpperCase()}`;
    }
    case "routing": {
      const n = m.routing?.rules.length ?? 0;
      return `${n} routing rule${n === 1 ? "" : "s"}`;
    }
    case "decisions":
      return m.decisions?.batch ? "Decided together in a batch" : "Decided one by one";
  }
}

/** Modules a hiring stage offers, in the order the editor lists them. */
export const HIRING_MODULES: ModuleKind[] = [
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
];

export const MODULE_PURPOSE: Record<ModuleKind, string> = {
  forms: "Collects the application, or asks for a follow-up form or a reference.",
  reviews: "Assigns reviewers and a scorecard to every application in this stage.",
  scheduling: "Sends a link to book an interview or a group session.",
  video: "Runs the call and, with consent, captures it.",
  messages: "Emails applicants when they enter or leave this stage.",
  tasks: "Creates a checklist for the coordinator when an application arrives.",
  files: "Asks applicants for documents and keeps a shared folder.",
  payments: "Takes an application fee or a deposit.",
  routing: "Sets a track, a reviewer pool or a flag for a person, from the answers.",
  decisions: "Records decisions, one by one or in a batch at a decision meeting.",
};

export const MODULE_LABEL = (k: ModuleKind) => MODULES[k].label;

/* ---------------- Team ---------------- */

export const ROLE_LABELS: Record<OpportunityRole, string> = {
  coordinator: "Coordinator",
  reviewer: "Reviewer",
  interviewer: "Interviewer",
  viewer: "Viewer",
};

export const ACCESS_SUMMARY =
  "Coordinators see every application and make decisions. Reviewers see only the applications assigned to them, and never see accommodations requests. Viewers see the pipeline without documents or reviews.";

export const COLLABORATOR_EXPLAINER =
  "Collaborators review, interview or view. They don't host bookings or own pipelines.";

/* ---------------- Privacy ---------------- */

/** The hiring legal pack's notice, pre-filled for the workspace; it states the 16+ rule (X5). */
export function privacyNoticeTemplate(workspace: string, retentionDays: number) {
  const months = Math.round(retentionDays / 30.4);
  return [
    `${workspace} uses Bookly to receive and review applications. We use what you send us only to assess your application and to contact you about it.`,
    "You must be 16 or older to apply.",
    "Your application is seen by the people running this selection round: coordinators see everything you send; reviewers see only the applications assigned to them. An accommodations request is seen by coordinators only. No automated system ranks, scores or rejects applicants: people make every decision.",
    `If you are not admitted, we delete your application ${months} months after the last decision of this round. You can withdraw your application, or ask us to delete it, at any time from the link in your confirmation email.`,
  ].join("\n\n");
}

/* ---------------- Edit after publish ---------------- */

/** Why a stage's category can't change now (it holds applications), or null. */
export function categoryChangeProblem(
  stage: Pick<SetupStage, "category" | "applications" | "isEntry">,
  to: StageCategory,
): string | null {
  if (stage.isEntry && to !== "open")
    return "The first stage receives applications, so it stays open.";
  if (to === stage.category) return null;
  if ((to === "won" || to === "lost") && stage.applications > 0)
    return "Move the applications out of this stage before making it an outcome.";
  return null;
}

/** Why a stage can't be removed (or where its applications must go first), or null. */
export function removeProblem(
  stages: Pick<SetupStage, "key" | "category" | "applications" | "isEntry" | "name">[],
  key: string,
  moveTo: string | null,
): string | null {
  const s = stages.find((x) => x.key === key);
  if (!s) return "That stage is gone.";
  if (s.isEntry) return "The first stage receives applications and can't be removed.";
  if (!s.applications) return null;
  const target = stages.find((x) => x.key === moveTo);
  if (!target || target.key === key || target.category !== "open")
    return `Move ${s.applications} application${s.applications === 1 ? "" : "s"} to an open stage before removing ${s.name}.`;
  return null;
}

/* ---------------- Lists and headers ---------------- */

/** The status chip of an opportunity: an open one whose window starts later is "Scheduled". */
export function opportunityStatus(
  status: OpportunityStatus,
  opensAt: Date | null,
  now = new Date(),
): { label: string; tone: "neutral" | "success" | "info" | "warning" } {
  switch (status) {
    case "draft":
      return { label: "Draft", tone: "neutral" };
    case "open":
      return opensAt && opensAt > now
        ? { label: "Scheduled", tone: "info" }
        : { label: "Open", tone: "success" };
    case "closed":
      return { label: "Closed", tone: "warning" };
    case "archived":
      return { label: "Archived", tone: "neutral" };
  }
}

/** "Spring cohort · Applications close Nov 15", the line under an opportunity's title. */
export function opportunityMeta(
  b: {
    cohort: string | null;
    status: OpportunityStatus;
    opensAt: Date | null;
    closesAt: Date | null;
  },
  timeZone: string,
  now = new Date(),
): string {
  const parts: string[] = [];
  if (b.cohort) parts.push(b.cohort);
  if (b.status === "open" && b.opensAt && b.opensAt > now)
    parts.push(`Applications open ${fmtDay(b.opensAt, timeZone)}`);
  else if (b.closesAt)
    parts.push(
      `Applications ${b.closesAt > now ? "close" : "closed"} ${fmtDay(b.closesAt, timeZone)}`,
    );
  else if (b.status === "draft") parts.push("Dates not set");
  return parts.join(" · ");
}
