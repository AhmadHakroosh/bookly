import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, createDb, eq, inArray, schema, type Database } from "@bookly/db";
import type { Actor } from "@/server/access/actor";
import {
  basicsProblems,
  candidateLabel,
  categoryChangeProblem,
  copyTitle,
  formHasNameAndEmail,
  hiringRuleProblem,
  journey,
  nextSlug,
  opportunityStatus,
  pipelineProblems,
  privacyNoticeTemplate,
  publishChecklist,
  removeProblem,
  slugify,
  type SetupBasics,
  type SetupStage,
} from "@/server/hiring/setup-text";
import { bindIds, TEMPLATE_IDS, TEMPLATES } from "@/server/hiring/templates";
import { retentionWarning } from "@/server/hiring/hiring-text";

/*
 * Opportunity setup (H1, planning/v2/ux/opportunity-setup.md): the templates, the pipeline
 * validity rules, the publish checklist and the Journey as pure functions; then, against a
 * migrated database (CI's check job), creating, copying, guarding and publishing.
 */

process.env.DATABASE_URL ??= "postgres://x:y@localhost:5432/x";
process.env.AUTH_SECRET ??= "test-secret-test-secret-test-secret-00";
process.env.APP_URL ??= "http://localhost:3002";

const sent = vi.hoisted(() => ({
  audit: [] as { action: string; changes?: Record<string, unknown> }[],
  events: [] as string[],
  email: [] as { to: string; subject: string }[],
  notify: [] as string[],
  limits: { opportunities: null as number | null, collaborators: null as number | null },
}));
vi.mock("@/server/audit", () => ({
  audit: async (a: { action: string; changes?: Record<string, unknown> }) =>
    void sent.audit.push(a),
}));
vi.mock("@/server/cache", () => ({ refreshWorkspace: () => {}, workspaceTag: (id: string) => id }));
vi.mock("@/server/webhooks", () => ({
  emitEvent: (_ws: string, e: string) => void sent.events.push(e),
}));
vi.mock("@/server/notifications", () => ({
  notify: async (_ws: unknown, userId: string) => void sent.notify.push(userId),
}));
vi.mock("@bookly/email", () => ({
  sendEmail: async (m: { to: string; subject: string }) => void sent.email.push(m),
}));
vi.mock("@/server/limits", () => ({
  workspaceLimits: () => sent.limits,
  assertWithinLimit: async () => {},
}));

/* ---------------- Pure ---------------- */

const stagesOf = (id: (typeof TEMPLATE_IDS)[number]): SetupStage[] => {
  const t = TEMPLATES[id];
  const ids = Object.fromEntries(
    [...Object.keys(t.forms), ...Object.keys(t.scorecards)].map((k) => [k, `id_${k.slice(1)}`]),
  );
  return t.stages.map((s, i) => ({
    id: `s${i}`,
    key: s.key,
    name: s.name,
    category: s.category,
    isEntry: i === 0,
    isWaitlist: !!s.isWaitlist,
    label: s.label,
    modules: bindIds(s.modules, ids),
    rules: (s.rules ?? []).map((r) => ({
      name: r.name,
      trigger: { on: r.on },
      actions: bindIds(r.actions, ids),
      active: true,
    })),
    applications: 0,
  }));
};

const basics: SetupBasics = {
  title: "2027 Horizon Fellowship",
  type: "fellowship",
  status: "draft",
  cohortName: "Spring cohort",
  opensAt: null,
  closesAt: new Date("2026-11-15T23:59:00Z"),
  decidesBy: new Date("2026-12-15T12:00:00Z"),
  capacity: 20,
  timezone: "UTC",
  slug: "2027-horizon-fellowship",
};

describe("templates", () => {
  it("each makes a pipeline that can be published", () => {
    for (const id of TEMPLATE_IDS) expect(pipelineProblems(stagesOf(id)), id).toEqual([]);
  });

  it("start blank with Applied, Accepted and Not selected", () => {
    expect(TEMPLATES.blank.stages.map((s) => [s.name, s.category])).toEqual([
      ["Applied", "open"],
      ["Accepted", "won"],
      ["Not selected", "lost"],
    ]);
  });

  it("give cohort templates a Waitlist stage, and only one", () => {
    for (const id of ["cohort", "internship", "program", "admissions"] as const) {
      const w = TEMPLATES[id].stages.filter((s) => s.isWaitlist);
      expect(
        w.map((s) => s.category),
        id,
      ).toEqual(["hold"]);
    }
  });

  it("ask internship and admissions applicants to confirm they are 16 or older", () => {
    for (const id of ["internship", "admissions"] as const) {
      const f = TEMPLATES[id].forms.$application!.schema.fields.find((x) => x.id === "age_16");
      expect(f, id).toMatchObject({ label: "I am 16 or older.", required: true });
    }
    expect(TEMPLATES.cohort.forms.$application!.schema.fields.some((f) => f.id === "age_16")).toBe(
      false,
    );
  });

  it("ask for name and email on every application form, and never score answers (X1)", () => {
    for (const id of TEMPLATE_IDS) {
      const schema = TEMPLATES[id].forms.$application!.schema;
      expect(formHasNameAndEmail(schema), id).toBe(true);
      for (const f of schema.fields) expect(f.type, `${id}.${f.id}`).not.toBe("number");
    }
  });

  it("pre-fill every outcome with a message and no rule (they wait for decision release)", () => {
    for (const id of TEMPLATE_IDS)
      for (const s of TEMPLATES[id].stages.filter((x) => x.category !== "open")) {
        expect(s.modules.messages?.templates.length, `${id}.${s.key}`).toBeGreaterThan(0);
        expect(s.rules ?? [], `${id}.${s.key}`).toEqual([]);
      }
  });

  it("leave nothing unbound once the draft's ids are known", () => {
    for (const id of TEMPLATE_IDS)
      expect(JSON.stringify(stagesOf(id)), id).not.toMatch(/"\$[a-z]+"/);
  });
});

describe("pipeline validity", () => {
  const cohort = () => stagesOf("cohort");

  it("blocks publishing while an outcome has no message, naming the stage and module", () => {
    const s = cohort();
    s.find((x) => x.key === "not_selected")!.modules.messages!.templates = [];
    expect(pipelineProblems(s)).toEqual([
      {
        code: "final_stage_without_message",
        stageKey: "not_selected",
        module: "messages",
        message: "Applicants who reach Not selected won't hear from you. Add a message to publish.",
      },
    ]);
  });

  it("needs an open first stage with the form, a won and a lost stage", () => {
    const s = cohort();
    s[0]!.modules.forms = { v: 1, enabled: false, forms: [] };
    expect(pipelineProblems(s).map((p) => p.code)).toEqual(["entry_forms"]);
    const noOutcomes = cohort().filter((x) => x.category === "open" || x.category === "hold");
    expect(pipelineProblems(noOutcomes).map((p) => p.code)).toEqual(["no_won", "no_lost"]);
    const moved = cohort();
    moved.push(moved.shift()!);
    expect(pipelineProblems(moved).map((p) => p.code)).toContain("entry_first");
  });

  it("refuses duplicate names, long names and more than 15 stages", () => {
    const s = cohort();
    s[1]!.name = "applied";
    expect(pipelineProblems(s)[0]!.message).toBe("Two stages are called applied.");
    s[1]!.name = "x".repeat(41);
    expect(pipelineProblems(s)[0]!.code).toBe("stage_name");
    const many = cohort();
    for (let i = 0; i < 10; i++)
      many.splice(1, 0, { ...many[1]!, key: `k${i}`, name: `Stage ${i}` });
    expect(pipelineProblems(many).map((p) => p.code)).toContain("stage_count");
  });

  it("never lets a rule decide: no move to an outcome, no outcome email by rule", () => {
    const s = cohort();
    const review = s.find((x) => x.key === "in_review")!;
    const won = s.find((x) => x.key === "admitted")!;
    expect(hiringRuleProblem({ type: "move_to_stage", stageKey: "admitted" }, review, s)).toMatch(
      /People decide outcomes/,
    );
    expect(
      hiringRuleProblem({ type: "move_to_stage", stageKey: "interview" }, review, s),
    ).toBeNull();
    expect(hiringRuleProblem({ type: "send_message", templateId: "t" }, won, s)).toMatch(
      /release decisions/,
    );
    review.rules.push({
      name: "Sneaky",
      trigger: { on: "enter" },
      actions: [{ type: "move_to_stage", stageKey: "not_selected" }],
      active: true,
    });
    expect(pipelineProblems(s).map((p) => p.code)).toEqual(["rule_decides"]);
  });

  it("lets Routing flag people for a person, never send them to an outcome", () => {
    const s = cohort();
    s[0]!.modules.routing = {
      v: 1,
      enabled: true,
      rules: [{ match: "all", conditions: [], to: { stage: "not_selected" } }],
    };
    expect(pipelineProblems(s).map((p) => p.code)).toEqual(["routing_rejects"]);
    s[0]!.modules.routing.rules[0]!.to = { flag: "Enrolled at a university" };
    expect(pipelineProblems(s)).toEqual([]);
  });

  it("guards live data: outcomes only when empty, removal moves people to an open stage", () => {
    const s = cohort();
    const review = { ...s.find((x) => x.key === "in_review")!, applications: 6 };
    expect(categoryChangeProblem(review, "hold")).toBeNull();
    expect(categoryChangeProblem(review, "lost")).toBe(
      "Move the applications out of this stage before making it an outcome.",
    );
    expect(categoryChangeProblem(s[0]!, "hold")).toMatch(/stays open/);
    const all = s.map((x) => (x.key === "in_review" ? review : x));
    expect(removeProblem(all, "in_review", null)).toBe(
      "Move 6 applications to an open stage before removing In review.",
    );
    expect(removeProblem(all, "in_review", "admitted")).not.toBeNull();
    expect(removeProblem(all, "in_review", "interview")).toBeNull();
    expect(removeProblem(all, "applied", "interview")).toMatch(/can't be removed/);
  });
});

describe("publish checklist", () => {
  const ok = { basics, stages: stagesOf("cohort"), privacyNotice: "Notice", coordinators: 1 };
  const form = TEMPLATES.cohort.forms.$application!.schema;

  it("is all green for a template with its dates set", () => {
    expect(publishChecklist({ ...ok, form }).every((i) => i.ok)).toBe(true);
  });

  it("names what to fix and where", () => {
    const items = publishChecklist({
      ...ok,
      form: { ...form, fields: form.fields.filter((f) => f.type !== "email") },
      privacyNotice: " ",
      coordinators: 0,
      basics: { ...basics, decidesBy: null },
    });
    expect(items.filter((i) => !i.ok).map((i) => [i.id, i.step])).toEqual([
      ["form_name_email", "stages"],
      ["privacy_notice", "privacy"],
      ["dates", "basics"],
      ["coordinator", "team"],
    ]);
    expect(items.find((i) => i.id === "dates")!.detail).toBe("Set the decisions-by date.");
  });
});

describe("the Journey", () => {
  it("lists every touchpoint, outcome emails as sent at release", () => {
    const j = journey(stagesOf("cohort"), basics);
    const applied = j.stages[0]!;
    expect(applied.label).toBe("Submitted");
    expect(applied.touchpoints).toEqual([
      expect.objectContaining({
        kind: "email",
        subject: "We received your application",
        when: "enter",
      }),
    ]);
    const admitted = j.stages.find((s) => s.key === "admitted")!;
    expect(admitted.touchpoints[0]).toMatchObject({ kind: "email", when: "release" });
    expect(admitted.touchpoints).toContainEqual({
      kind: "action",
      text: "Upload: Signed agreement",
    });
  });

  it("warns about quiet stages and due dates past the promised decision date", () => {
    const j = journey(stagesOf("cohort"), {
      ...basics,
      decidesBy: new Date("2026-11-20T00:00:00Z"),
    });
    expect(j.warnings).toEqual([
      {
        tone: "advice",
        stageKey: "in_review",
        text: "Applicants may wait in In review for up to 2 weeks without an update. Consider an update email.",
      },
      {
        tone: "advice",
        text: "Decisions are promised by Nov 20. Your review and interview due dates end Dec 2.",
      },
    ]);
  });

  it("blocks on an outcome nobody hears about", () => {
    const s = stagesOf("blank");
    s[1]!.modules.messages!.templates = [];
    expect(journey(s, basics).warnings).toContainEqual({
      tone: "blocking",
      stageKey: "accepted",
      text: "Applicants who reach Accepted won't hear from you. Add a message to publish.",
    });
  });
});

describe("words", () => {
  it("labels stages for applicants without exposing internal holds", () => {
    const hold = { label: null, category: "hold" as const, isEntry: false, isWaitlist: false };
    expect(candidateLabel(hold)).toBe("Under review");
    expect(candidateLabel({ ...hold, isWaitlist: true })).toBe("On the waitlist");
    expect(candidateLabel({ ...hold, label: "Interview" })).toBe("Interview");
  });

  it("makes links and copies", () => {
    expect(slugify("2027 Horizon Fellowship — Spring!")).toBe("2027-horizon-fellowship-spring");
    expect(nextSlug("a", ["a", "a-2"])).toBe("a-3");
    expect(copyTitle("Fellowship (copy)")).toBe("Fellowship (copy)");
  });

  it("checks Basics", () => {
    const b = {
      ...basics,
      cohortName: "",
      opensAt: new Date("2026-12-01T00:00:00Z"),
      decidesBy: new Date("2026-11-01T00:00:00Z"),
      capacity: 0,
      slug: "-bad",
      timezone: "Mars/Olympus",
    };
    expect(Object.keys(basicsProblems(b)).sort()).toEqual([
      "capacity",
      "closesAt",
      "decidesBy",
      "slug",
      "timezone",
    ]);
  });

  it("states the 16+ rule in the notice and warns about short retention for internships", () => {
    expect(privacyNoticeTemplate("Acme", 183)).toContain("You must be 16 or older to apply.");
    expect(privacyNoticeTemplate("Acme", 183)).toContain("6 months after the last decision");
    expect(retentionWarning("internship", 183)).toMatch(/at least a year/);
    expect(retentionWarning("fellowship", 30)).toBeNull();
  });

  it("calls an open opportunity whose window starts later Scheduled", () => {
    const later = new Date(Date.now() + 86_400_000);
    expect(opportunityStatus("open", later).label).toBe("Scheduled");
    expect(opportunityStatus("open", null).label).toBe("Open");
  });
});

/* ---------------- Database ---------------- */

const url = process.env.DATABASE_URL;
const realDb = !!url && !url.includes("x:y@");

describe.skipIf(!realDb)("opportunity setup (seeded database)", () => {
  let db: Database;
  const run = crypto.randomUUID().slice(0, 8);
  const id = (k: string) => `h1_${run}_${k}`;
  const slug = (k: string) => id(k).replace(/_/g, "-");
  const ws = id("ws");
  const [owner, member, collab] = [id("owner"), id("member"), id("collab")];
  const actor = (u: string, roles: Record<string, string> = {}): Actor =>
    ({
      userId: u,
      workspaceId: ws,
      workspaceRole: u === owner ? "owner" : u === collab ? "collaborator" : "member",
      opportunityRoles: new Map(Object.entries(roles)),
    }) as Actor;
  let setup: typeof import("@/server/hiring/setup");
  let invites: typeof import("@/server/hiring/invites");
  let workspace: typeof schema.workspaces.$inferSelect;

  beforeAll(async () => {
    db = createDb(url!);
    setup = await import("@/server/hiring/setup");
    invites = await import("@/server/hiring/invites");
    const now = new Date();
    await db.insert(schema.users).values(
      [owner, member, collab].map((u) => ({
        id: u,
        name: u,
        email: `${u}@example.test`,
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      })),
    );
    await db
      .insert(schema.organizations)
      .values({ id: id("org"), name: "H1", slug: id("org"), createdAt: now });
    await db.insert(schema.members).values(
      [owner, member, collab].map((u) => ({
        id: id(`m_${u}`),
        organizationId: id("org"),
        userId: u,
        role: u === owner ? "owner" : u === collab ? "collaborator" : "member",
        createdAt: now,
      })),
    );
    workspace = (
      await db
        .insert(schema.workspaces)
        .values({ id: ws, organizationId: id("org"), slug: id("ws"), name: "Horizon" })
        .returning()
    )[0]!;
  });

  afterAll(async () => {
    if (!db) return;
    await db.delete(schema.organizations).where(eq(schema.organizations.id, id("org")));
    await db.delete(schema.users).where(inArray(schema.users.id, [owner, member, collab]));
  });

  const stagesIn = async (oppId: string) => {
    const [o] = await db
      .select()
      .from(schema.opportunities)
      .where(eq(schema.opportunities.id, oppId));
    return db
      .select()
      .from(schema.pipelineStages)
      .where(eq(schema.pipelineStages.pipelineId, o!.pipelineId))
      .orderBy(schema.pipelineStages.position);
  };

  it("creates a draft from a template with its stages, rules, forms and scorecards", async () => {
    const oppId = await setup.createFromTemplate(actor(owner), workspace, "cohort");
    const stages = await stagesIn(oppId);
    expect(stages.map((s) => s.key)).toEqual([
      "applied",
      "in_review",
      "interview",
      "decision",
      "admitted",
      "waitlist",
      "not_selected",
    ]);
    expect(stages.filter((s) => s.isEntry).map((s) => s.key)).toEqual(["applied"]);
    const [opp] = await db
      .select()
      .from(schema.opportunities)
      .where(eq(schema.opportunities.id, oppId));
    expect(opp).toMatchObject({ status: "draft", type: "fellowship" });
    const form = await db.query.forms.findFirst({ where: eq(schema.forms.id, opp!.formId!) });
    expect(form).toMatchObject({ purpose: "application", shared: false });
    const review = stages.find((s) => s.key === "in_review")!.modules as {
      reviews: { scorecardId: string };
    };
    const card = await db.query.scorecards.findFirst({
      where: eq(schema.scorecards.id, review.reviews.scorecardId),
    });
    expect(card?.criteria).toHaveLength(4);
    const rules = await db
      .select()
      .from(schema.stageRules)
      .where(eq(schema.stageRules.pipelineId, opp!.pipelineId));
    expect(rules.map((r) => r.name).sort()).toEqual([
      "Assign reviewers",
      "Confirm the application",
    ]);
    const team = await db
      .select()
      .from(schema.opportunityMembers)
      .where(eq(schema.opportunityMembers.opportunityId, oppId));
    expect(team.map((m) => [m.userId, m.role])).toEqual([[owner, "coordinator"]]);
  });

  it("keeps people who can't coordinate out of setup", async () => {
    const oppId = await setup.createFromTemplate(actor(owner), workspace, "blank");
    await expect(
      setup.saveBasics(actor(member, { [oppId]: "reviewer" }), oppId, {
        ...basics,
        cohortName: "",
        slug: "nope",
      }),
    ).rejects.toThrow();
    await expect(setup.createFromTemplate(actor(collab), workspace, "blank")).rejects.toThrow(
      /Only coordinators/,
    );
  });

  it("publishes only when the checklist is green, then sends the held invitations", async () => {
    const me = actor(owner);
    const oppId = await setup.createFromTemplate(me, workspace, "blank");
    let r = await setup.publishOpportunity(me, workspace, oppId);
    expect(r).toEqual({ ok: false, reasons: ["dates"] });
    expect(
      await setup.saveBasics(me, oppId, {
        title: "Blank round",
        cohortName: "",
        type: "custom",
        opensAt: null,
        closesAt: new Date(Date.now() + 10 * 86_400_000),
        decidesBy: new Date(Date.now() + 20 * 86_400_000),
        capacity: null,
        timezone: "UTC",
        slug: slug("blank"),
      }),
    ).toEqual({ problems: {} });
    const res = await invites.inviteToTeam(me, workspace, oppId, "Reviewer@Uni.test", "reviewer");
    expect(res).toEqual({ added: "invited" });
    expect(sent.email).toEqual([]);
    sent.limits.opportunities = 0;
    r = await setup.publishOpportunity(me, workspace, oppId);
    expect(r).toMatchObject({ ok: false, reasons: ["open_opportunities"] });
    sent.limits.opportunities = null;
    r = await setup.publishOpportunity(me, workspace, oppId);
    expect(r).toMatchObject({ ok: true, scheduled: null });
    expect(sent.events).toContain("opportunity.published");
    expect(sent.email.map((m) => [m.to, m.subject])).toEqual([
      [
        "reviewer@uni.test",
        "h1_" + run + "_owner invited you to review applications for Blank round",
      ],
    ]);
    const [inv] = await db
      .select()
      .from(schema.invitations)
      .where(
        and(
          eq(schema.invitations.organizationId, id("org")),
          eq(schema.invitations.email, "reviewer@uni.test"),
        ),
      );
    expect(inv).toMatchObject({ role: "collaborator", status: "pending" });
    // Accepting the workspace invitation puts them on the team.
    await db.insert(schema.users).values({
      id: id("rev"),
      name: "Rev",
      email: "reviewer@uni.test",
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    expect(await invites.applyOpportunityInvites(id("org"), id("rev"), "reviewer@uni.test")).toBe(
      1,
    );
    const team = await db
      .select({ userId: schema.opportunityMembers.userId, role: schema.opportunityMembers.role })
      .from(schema.opportunityMembers)
      .where(eq(schema.opportunityMembers.opportunityId, oppId));
    expect(team).toContainEqual({ userId: id("rev"), role: "reviewer" });
    await db.delete(schema.users).where(eq(schema.users.id, id("rev")));
    const [o] = await db
      .select()
      .from(schema.opportunities)
      .where(eq(schema.opportunities.id, oppId));
    expect(o).toMatchObject({ status: "open" });
    expect(o!.publishedAt).toBeInstanceOf(Date);
  });

  it("copies setup, never applications, clears dates and makes a new link", async () => {
    const me = actor(owner);
    const src = await setup.createFromTemplate(me, workspace, "internship");
    await setup.saveBasics(me, src, {
      title: "Summer internship",
      cohortName: "2026",
      type: "internship",
      opensAt: null,
      closesAt: new Date("2030-01-01T00:00:00Z"),
      decidesBy: new Date("2030-02-01T00:00:00Z"),
      capacity: 10,
      timezone: "UTC",
      slug: slug("summer"),
    });
    await db.insert(schema.opportunityMembers).values({
      workspaceId: ws,
      opportunityId: src,
      userId: member,
      role: "reviewer",
    });
    const plain = await setup.cloneOpportunity(me, workspace, src, { team: false });
    const withTeam = await setup.cloneOpportunity(me, workspace, src, { team: true });
    const [copy] = await db
      .select()
      .from(schema.opportunities)
      .where(eq(schema.opportunities.id, plain));
    expect(copy).toMatchObject({
      title: "Summer internship (copy)",
      status: "draft",
      clonedFromId: src,
    });
    expect(copy!.slug).not.toBe(slug("summer"));
    const cohort = await db.query.opportunityCohorts.findFirst({
      where: eq(schema.opportunityCohorts.opportunityId, plain),
    });
    expect(cohort).toMatchObject({ name: "2026", capacity: 10, closesAt: null, decidesBy: null });
    expect((await stagesIn(plain)).map((s) => s.key)).toEqual(
      (await stagesIn(src)).map((s) => s.key),
    );
    const [source] = await db
      .select()
      .from(schema.opportunities)
      .where(eq(schema.opportunities.id, src));
    expect(copy!.formId).not.toBe(source!.formId);
    const team = async (o: string) =>
      (
        await db
          .select({ userId: schema.opportunityMembers.userId })
          .from(schema.opportunityMembers)
          .where(eq(schema.opportunityMembers.opportunityId, o))
      )
        .map((m) => m.userId)
        .sort();
    expect(await team(plain)).toEqual([owner]);
    expect(await team(withTeam)).toEqual([member, owner].sort());
    expect(sent.audit.find((a) => a.action === "opportunity.cloned")).toBeTruthy();
  });

  it("guards the editor: the first stage keeps its form, outcomes stay reachable only by people", async () => {
    const me = actor(owner);
    const oppId = await setup.createFromTemplate(me, workspace, "cohort");
    const stages = await stagesIn(oppId);
    const byKey = (k: string) => stages.find((s) => s.key === k)!;
    expect(
      await setup.saveModule(me, oppId, byKey("applied").id, "forms", { enabled: false }),
    ).toMatch(/Forms stays on/);
    expect(
      await setup.saveHiringRule(me, oppId, byKey("in_review").id, null, {
        name: "Reject",
        on: "enter",
        tag: "",
        actions: [{ type: "move_to_stage", stageKey: "not_selected" }],
      }),
    ).toContain("Rules can't move applications to an outcome. People decide outcomes in Bookly.");
    expect(
      await setup.saveModule(me, oppId, byKey("applied").id, "routing", {
        config: {
          v: 1,
          enabled: true,
          rules: [{ match: "all", conditions: [], to: { stage: "not_selected" } }],
        },
      }),
    ).toMatch(/never move it to an outcome/);
    expect(await setup.reorderStages(me, oppId, stages.map((s) => s.key).reverse())).toMatch(
      /stays first/,
    );
    // A stage holding applications moves them to an open stage before it goes.
    const [cohort] = await db
      .select()
      .from(schema.opportunityCohorts)
      .where(eq(schema.opportunityCohorts.opportunityId, oppId));
    await db
      .insert(schema.contacts)
      .values({ id: id("c1"), workspaceId: ws, email: `${id("c1")}@example.test`, name: "A" });
    await db.insert(schema.applications).values({
      id: id("app1"),
      workspaceId: ws,
      opportunityId: oppId,
      cohortId: cohort!.id,
      contactId: id("c1"),
      stageId: byKey("in_review").id,
      state: "active",
    });
    expect(await setup.updateStage(me, oppId, byKey("in_review").id, { category: "lost" })).toMatch(
      /before making it an outcome/,
    );
    expect(await setup.removeStage(me, oppId, byKey("in_review").id, null)).toMatch(
      /Move 1 application/,
    );
    expect(await setup.removeStage(me, oppId, byKey("in_review").id, "interview")).toBeNull();
    const [app] = await db
      .select()
      .from(schema.applications)
      .where(eq(schema.applications.id, id("app1")));
    expect(app!.stageId).toBe(byKey("interview").id);
    // Archiving waits until every applicant has heard their decision.
    expect(await setup.archiveOpportunity(me, oppId)).toEqual({ unheard: 1 });
  });

  it("refuses another workspace's opportunity, other opportunities' forms and scorecards", async () => {
    const me = actor(owner);
    const mine = await setup.createFromTemplate(me, workspace, "cohort");
    const theirs = await setup.createFromTemplate(me, workspace, "cohort");
    // An id from elsewhere: owners coordinate any id, so the server must check the workspace.
    expect(
      await invites.inviteToTeam(me, { ...workspace, id: "another" }, mine, "x@uni.test", "viewer"),
    ).toEqual({ error: "That opportunity is gone." });
    const stagesOf2 = await stagesIn(theirs);
    const theirReview = (
      stagesOf2.find((s) => s.key === "in_review")!.modules as {
        reviews: { scorecardId: string };
      }
    ).reviews;
    const theirAcceptance = (
      stagesOf2.find((s) => s.key === "admitted")!.modules as {
        forms: { forms: { formId: string }[] };
      }
    ).forms.forms[0]!.formId;
    const myStages = await stagesIn(mine);
    const review = myStages.find((s) => s.key === "in_review")!;
    expect(
      await setup.saveModule(me, mine, review.id, "reviews", {
        config: {
          ...(review.modules as { reviews: object }).reviews,
          scorecardId: theirReview.scorecardId,
        },
      }),
    ).toBe("That scorecard belongs to another opportunity.");
    const admitted = myStages.find((s) => s.key === "admitted")!;
    expect(
      await setup.saveModule(me, mine, admitted.id, "forms", {
        config: { v: 1, enabled: true, forms: [{ formId: theirAcceptance, audience: "subject" }] },
      }),
    ).toBe("Choose one of this opportunity's forms.");
    // Discarding a draft keeps what another opportunity uses.
    await setup.discardDraft(me, mine);
    expect(
      await db.query.scorecards.findFirst({
        where: eq(schema.scorecards.id, theirReview.scorecardId),
      }),
    ).toBeTruthy();
    expect(
      await db.query.forms.findFirst({ where: eq(schema.forms.id, theirAcceptance) }),
    ).toBeTruthy();
  });

  it("keeps a stage a rule moves people to from becoming an outcome or going away", async () => {
    const me = actor(owner);
    const oppId = await setup.createFromTemplate(me, workspace, "cohort");
    const stages = await stagesIn(oppId);
    const byKey = (k: string) => stages.find((s) => s.key === k)!;
    expect(
      await setup.saveHiringRule(me, oppId, byKey("in_review").id, null, {
        name: "On to interview",
        on: "enter",
        tag: "",
        actions: [{ type: "move_to_stage", stageKey: "interview" }],
      }),
    ).toEqual([]);
    expect(await setup.updateStage(me, oppId, byKey("interview").id, { category: "won" })).toMatch(
      /only people decide outcomes/,
    );
    expect(await setup.updateStage(me, oppId, byKey("interview").id, { category: "hold" })).toMatch(
      /only people decide outcomes/,
    );
    expect(await setup.removeStage(me, oppId, byKey("interview").id, null)).toMatch(
      /The rule "On to interview" on In review moves applications to Interview/,
    );
  });
});
