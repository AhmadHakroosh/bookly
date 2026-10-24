import { describe, expect, it } from "vitest";
import { evaluate } from "@bookly/forms";
import { fromEditor, toEditor, type EditorRule } from "@/server/pipelines/editor-text";
import {
  kindsFor,
  moduleOfAction,
  parseModule,
  readModules,
  type StageModuleConfigs,
} from "@/server/pipelines/modules";
import {
  MAX_DEPTH,
  contactFacts,
  fillPlaceholders,
  resumeFrom,
  retryAt,
  ruleProblems,
  type RuleDraft,
} from "@/server/pipelines/rules-text";

const ctx = (modules: StageModuleConfigs = {}) => ({
  subject: "contact" as const,
  stageKey: "won",
  stageKeys: ["lead", "active", "won", "lost"],
  modules,
});
const rule = (patch: Partial<RuleDraft> = {}): RuleDraft => ({
  name: "Onboard",
  trigger: { on: "enter" },
  conditions: null,
  actions: [{ type: "add_tag", tag: "client" }],
  delayMinutes: 0,
  ...patch,
});

describe("module registry", () => {
  it("keeps Reviews and Decisions to hiring pipelines", () => {
    expect(kindsFor("contact")).not.toContain("reviews");
    expect(kindsFor("contact")).not.toContain("decisions");
    expect(kindsFor("application")).toContain("reviews");
  });

  it("knows which module an action needs, and that decisions have none", () => {
    expect(moduleOfAction("send_message")).toBe("messages");
    expect(moduleOfAction("move_to_stage")).toBeNull();
    expect(moduleOfAction("assign_reviewers")).toBe("reviews");
  });

  it("validates each module's config and fills defaults", () => {
    expect(parseModule("tasks", { v: 1, checklist: [{ title: "Contract" }] })).toEqual({
      config: {
        v: 1,
        enabled: true,
        checklist: [{ title: "Contract", assignee: "coordinator", dueDays: null }],
      },
    });
    expect(parseModule("payments", { v: 1, amountCents: 10, currency: "usd" })).toHaveProperty(
      "problem",
    );
  });

  it("reads stored modules, leaving out unknown or broken ones with the reason", () => {
    const r = readModules({
      tasks: { v: 1, checklist: [] },
      robots: { v: 1 },
      payments: { v: 1 },
    });
    expect(Object.keys(r.modules)).toEqual(["tasks"]);
    expect(r.problems).toHaveLength(2);
  });
});

describe("rule validation", () => {
  it("accepts a plain enter rule", () => {
    expect(ruleProblems(rule(), ctx())).toEqual([]);
  });

  it("refuses waiting rules until 1.1 and unknown events", () => {
    expect(ruleProblems(rule({ trigger: { on: "idle", afterMinutes: 60 } }), ctx())).toContain(
      "Rules that wait for time in a stage arrive in 1.1.",
    );
    expect(
      ruleProblems(rule({ trigger: { on: "event", event: "review.submitted" } }), ctx()),
    ).toContain('Unknown event "review.submitted".');
    expect(
      ruleProblems(rule({ trigger: { on: "event", event: "booking.created" } }), ctx()),
    ).toEqual([]);
  });

  it("refuses moving people into the rule's own stage, or nowhere", () => {
    expect(
      ruleProblems(rule({ actions: [{ type: "move_to_stage", stageKey: "won" }] }), ctx()),
    ).toContain("Action 1: an automation cannot move people into its own stage.");
    expect(
      ruleProblems(rule({ actions: [{ type: "move_to_stage", stageKey: "nope" }] }), ctx()),
    ).toContain("Action 1: unknown stage.");
  });

  it("needs the stage config an action points at", () => {
    expect(
      ruleProblems(rule({ actions: [{ type: "send_message", templateId: "t_1" }] }), ctx()),
    ).toContain("Action 1: the message is missing.");
    expect(ruleProblems(rule({ actions: [{ type: "create_tasks" }] }), ctx())).toContain(
      "Action 1: the checklist is empty.",
    );
    expect(ruleProblems(rule({ actions: [{ type: "assign_reviewers" }] }), ctx())).toContain(
      "Action 1: not available on this pipeline.",
    );
  });

  it("caps delays at a week and asks for a name and an action", () => {
    expect(ruleProblems(rule({ delayMinutes: 8 * 24 * 60 }), ctx())).toContain(
      "Wait at most 7 days.",
    );
    expect(ruleProblems(rule({ name: " ", actions: [] }), ctx())).toEqual(
      expect.arrayContaining(["Give the automation a name.", "Add at least one action."]),
    );
  });
});

describe("running rules", () => {
  it("retries after 1, 5, 30, 120 and 720 minutes, then gives up", () => {
    const now = new Date("2026-10-24T10:00:00Z");
    expect(retryAt(1, now)?.toISOString()).toBe("2026-10-24T10:01:00.000Z");
    expect(retryAt(5, now)?.toISOString()).toBe("2026-10-24T22:00:00.000Z");
    expect(retryAt(6, now)).toBeNull();
  });

  it("resumes after the actions already done or skipped", () => {
    expect(resumeFrom([])).toBe(0);
    expect(resumeFrom(["done", "skipped:opted_out", "failed:smtp"])).toBe(2);
    expect(resumeFrom(["done", "done"])).toBe(2);
  });

  it("guards against loops", () => {
    expect(MAX_DEPTH).toBe(5);
  });

  it("evaluates conditions on a contact's tags and stage", () => {
    const facts = contactFacts({
      tags: ["vip", "eu"],
      email: "a@acme.io",
      company: "Acme",
      stageKey: "won",
    });
    expect(
      evaluate(
        { match: "all", conditions: [{ fieldId: "tags", op: "equals", value: "vip" }] },
        facts,
      ),
    ).toBe(true);
    expect(
      evaluate(
        { match: "all", conditions: [{ fieldId: "tags", op: "equals", value: "us" }] },
        facts,
      ),
    ).toBe(false);
    expect(facts.email_domain).toBe("acme.io");
  });

  it("fills placeholders and leaves unknown ones", () => {
    expect(fillPlaceholders("Hi {name}, {unknown}", { name: "Ada" })).toBe("Hi Ada, {unknown}");
  });
});

describe("the automations editor", () => {
  const draft: EditorRule = {
    name: "Onboard new clients",
    on: "enter",
    delayHours: 2,
    tag: "VIP",
    actions: [
      { kind: "tasks", items: [{ title: "Send the contract", dueDays: 2 }] },
      { kind: "email", subject: "Welcome, {name}", body: "Hi {name}", transactional: false },
      { kind: "booking_link", eventTypeId: "et_1" },
      { kind: "move", stageKey: "active" },
    ],
  };

  it("stores the emails, checklist and sessions on the stage and points the rule at them", () => {
    const { rule: r, modules } = fromEditor(draft, {}, new Set());
    expect(r.delayMinutes).toBe(120);
    expect(r.conditions).toEqual({
      match: "all",
      conditions: [{ fieldId: "tags", op: "equals", value: "vip" }],
    });
    expect(r.actions.map((a) => a.type)).toEqual([
      "create_tasks",
      "send_message",
      "send_booking_link",
      "move_to_stage",
    ]);
    expect(modules.tasks?.checklist).toEqual([
      { title: "Send the contract", assignee: "coordinator", dueDays: 2 },
    ]);
    expect(modules.messages?.templates).toHaveLength(1);
    expect(modules.scheduling?.sessions).toEqual([
      { eventTypeId: "et_1", mode: "self_schedule", hosts: "pool" },
    ]);
    expect(ruleProblems(r, { ...ctx(modules), stageKey: "won" })).toEqual([]);
  });

  it("round-trips through the editor, keeping the email's template", () => {
    const { rule: r, modules } = fromEditor(draft, {}, new Set());
    const back = toEditor({ ...r, conditions: r.conditions }, modules);
    expect(back).toMatchObject({ name: draft.name, on: "enter", delayHours: 2, tag: "vip" });
    expect(back.actions[1]).toMatchObject({ kind: "email", subject: "Welcome, {name}" });
    const again = fromEditor(back, modules, new Set());
    expect(again.modules.messages?.templates).toEqual(modules.messages?.templates);
  });

  it("drops emails no automation sends any more, but keeps other rules' ones", () => {
    const { modules } = fromEditor(draft, {}, new Set());
    const other = modules.messages!.templates[0]!.id;
    const withoutEmail = { ...draft, actions: draft.actions.filter((a) => a.kind !== "email") };
    expect(fromEditor(withoutEmail, modules, new Set()).modules.messages?.templates).toEqual([]);
    expect(
      fromEditor(withoutEmail, modules, new Set([other])).modules.messages?.templates,
    ).toHaveLength(1);
  });

  it("keeps booking sessions in place so other rules' positions hold", () => {
    const { modules } = fromEditor(draft, {}, new Set());
    const second = fromEditor(
      { ...draft, actions: [{ kind: "booking_link", eventTypeId: "et_2" }] },
      modules,
      new Set(),
    );
    expect(second.modules.scheduling?.sessions.map((s) => s.eventTypeId)).toEqual(["et_1", "et_2"]);
    expect(second.rule.actions).toEqual([{ type: "send_booking_link", sessionIndex: 1 }]);
  });
});
