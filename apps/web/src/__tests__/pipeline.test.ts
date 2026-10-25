import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, createDb, eq, inArray, schema, type Database } from "@bookly/db";
import type { ApplicationFlag } from "@bookly/db/schema";
import type { Actor } from "@/server/access/actor";
import {
  attention,
  cardLine,
  exitChecks,
  initials,
  moveProblem,
  type CardFacts,
} from "@/server/hiring/pipeline-text";

/*
 * The hiring board (H3, hiring.png): what a card says next, advisory exit checks, which moves
 * the board refuses and Needs attention as pure functions; then, against a migrated database,
 * who sees what, moves with "Move anyway" audited, outcomes refused, requirement flags, and
 * stage rules running for applications without ever reaching an outcome.
 */

process.env.DATABASE_URL ??= "postgres://x:y@localhost:5432/x";
process.env.AUTH_SECRET ??= "test-secret-test-secret-test-secret-00";
process.env.APP_URL ??= "http://localhost:3002";

const sent = vi.hoisted(() => ({
  audit: [] as { action: string; target?: { id: string }; changes?: Record<string, unknown> }[],
  events: [] as { event: string; payload: Record<string, unknown> }[],
  email: [] as { to: string; subject: string; text: string }[],
  notify: [] as { userId: string; kind: string }[],
  jobs: [] as { runId: string }[],
}));
vi.mock("@/server/audit", () => ({
  audit: async (a: (typeof sent.audit)[number]) => void sent.audit.push(a),
  SYSTEM_ACTOR: (id: string) => ({ type: "system", id, label: "Automation" }),
}));
vi.mock("@/server/cache", () => ({ refreshWorkspace: () => {}, workspaceTag: (id: string) => id }));
vi.mock("@/server/webhooks", () => ({
  emitEvent: (_ws: string, event: string, payload: Record<string, unknown>) =>
    void sent.events.push({ event, payload }),
}));
vi.mock("@/server/notifications", () => ({
  notify: async (_ws: unknown, userId: string, n: { kind: string }) =>
    void sent.notify.push({ userId, kind: n.kind }),
}));
vi.mock("@bookly/email", () => ({
  sendEmail: async (m: { to: string; subject: string; text: string }) => void sent.email.push(m),
}));
vi.mock("@bookly/jobs", () => ({
  enqueue: async (_kind: string, payload: { runId: string }) => void sent.jobs.push(payload),
}));
vi.mock("@/server/urls", () => ({ publicBaseUrl: async () => "https://horizon.test" }));
vi.mock("@/server/flags", async (orig) => ({
  ...(await orig<typeof import("@/server/flags")>()),
  hasFlag: async () => true,
}));
vi.mock("next/cache", () => ({
  cacheTag: () => {},
  cacheLife: () => {},
  updateTag: () => {},
  revalidateTag: () => {},
  revalidatePath: () => {},
}));

/* ---------------- Pure ---------------- */

const facts = (o: Partial<CardFacts> = {}): CardFacts => ({
  flags: [],
  reviews: { total: 0, submitted: 0, overdue: 0, mine: null },
  interviewAt: null,
  awaitingScheduling: false,
  ...o,
});
const flag = (requirement: string): ApplicationFlag => ({
  kind: "requirement",
  requirement,
  ruleId: "r",
  at: "2026-10-20T10:00:00Z",
});
const now = new Date("2026-10-25T12:00:00Z");

describe("the card line", () => {
  it("says the one thing that matters next, flags first", () => {
    const tue = new Date("2026-10-27T10:00:00Z");
    expect(
      cardLine(facts({ flags: [flag("Eligible in the EU")], interviewAt: tue }), "UTC", now),
    ).toMatchObject({ tone: "warning", text: "Doesn't meet: Eligible in the EU" });
    expect(cardLine(facts({ interviewAt: tue }), "UTC", now)?.text).toBe("Interview Tue 10:00");
    const r = (submitted: number, total: number, overdue = 0) =>
      cardLine(facts({ reviews: { total, submitted, overdue, mine: null } }), "UTC", now)?.text;
    expect(r(0, 3, 1)).toBe("Feedback missing");
    expect(r(2, 3)).toBe("2 of 3 reviews submitted");
    expect(r(0, 1)).toBe("Review assigned");
    expect(r(3, 3)).toBe("All reviews submitted");
    expect(cardLine(facts({ awaitingScheduling: true }), "UTC", now)?.text).toBe(
      "Awaiting scheduling",
    );
    expect(cardLine(facts(), "UTC", now)).toBeNull();
    // A past interview no longer leads.
    expect(
      cardLine(facts({ interviewAt: new Date("2026-10-20T10:00:00Z") }), "UTC", now),
    ).toBeNull();
  });

  it("initials from the name, or the email", () => {
    expect(initials("Maya Chen", "m@x.test")).toBe("MC");
    expect(initials("Cher", "c@x.test")).toBe("C");
    expect(initials("  ", "zoe@x.test")).toBe("Z");
  });
});

describe("exit checks and moves", () => {
  const reviews = {
    reviews: {
      enabled: true,
      scorecardId: "s",
      reviewersPerApplication: 3,
      dueDays: 7,
      blind: false,
    },
  } as never;

  it("counts the stage's planned reviews, not only those assigned", () => {
    expect(exitChecks(reviews, { total: 0, submitted: 0 })).toEqual([
      { id: "reviews_missing", text: "3 of 3 reviews missing" },
    ]);
    expect(exitChecks(reviews, { total: 3, submitted: 2 })[0]!.text).toBe("1 of 3 reviews missing");
    expect(exitChecks(reviews, { total: 3, submitted: 3 })).toEqual([]);
    expect(exitChecks({}, { total: 0, submitted: 0 })).toEqual([]);
  });

  it("never moves a card to an outcome", () => {
    expect(moveProblem({ category: "open", name: "Interview" })).toBeNull();
    for (const category of ["won", "lost", "hold"] as const)
      expect(moveProblem({ category, name: "Admitted" })).toMatch(/records a decision/);
    expect(moveProblem(null)).toBe("That stage is gone.");
  });
});

describe("needs attention", () => {
  it("collects overdue feedback, scheduling, flags and long waits", () => {
    const stage = { id: "s1", name: "In review", attentionAfterDays: 5 };
    const items = attention(
      [
        {
          id: "a",
          stageId: "s1",
          stageEnteredAt: new Date("2026-10-10T00:00:00Z"),
          facts: facts(),
        },
        {
          id: "b",
          stageId: "s1",
          stageEnteredAt: now,
          facts: facts({ reviews: { total: 3, submitted: 1, overdue: 2, mine: null } }),
        },
        { id: "c", stageId: "s1", stageEnteredAt: now, facts: facts({ awaitingScheduling: true }) },
        { id: "d", stageId: "s1", stageEnteredAt: now, facts: facts({ flags: [flag("Age 18+")] }) },
      ],
      [stage],
      now,
    );
    expect(items.map((i) => [i.id, i.title])).toEqual([
      ["feedback", "Feedback missing"],
      ["scheduling", "1 candidate awaiting scheduling"],
      ["flagged", "1 application flagged"],
      ["waiting", "1 candidate waiting longer than planned"],
    ]);
    expect(items[0]!.detail).toBe("1 candidate has overdue reviews");
    expect(attention([], [stage], now)).toEqual([]);
  });
});

/* ---------------- Database ---------------- */

const url = process.env.DATABASE_URL;
const realDb = !!url && !url.includes("x:y@");

describe.skipIf(!realDb)("the board (seeded database)", () => {
  let db: Database;
  const run = crypto.randomUUID().slice(0, 8);
  const id = (k: string) => `h3_${run}_${k}`;
  const ws = id("ws");
  const owner = id("owner");
  const viewerId = id("viewer");
  const me = {
    userId: owner,
    workspaceId: ws,
    workspaceRole: "owner",
    opportunityRoles: new Map(),
  } as unknown as Actor;
  let viewer: Actor;
  let reviewer: Actor;
  let workspace: typeof schema.workspaces.$inferSelect;
  let pipeline: typeof import("@/server/hiring/pipeline");
  let rules: typeof import("@/server/pipelines/rules");
  let oppId = "";
  let stage: Record<string, string> = {};
  const apps: string[] = [];

  beforeAll(async () => {
    db = createDb(url!);
    pipeline = await import("@/server/hiring/pipeline");
    rules = await import("@/server/pipelines/rules");
    const setup = await import("@/server/hiring/setup");
    const t = new Date();
    for (const [uid, name] of [
      [owner, "Olivia Park"],
      [viewerId, "Vic Viewer"],
    ] as const)
      await db.insert(schema.users).values({
        id: uid,
        name,
        email: `${uid}@example.test`,
        emailVerified: true,
        createdAt: t,
        updatedAt: t,
      });
    await db
      .insert(schema.organizations)
      .values({ id: id("org"), name: "H3", slug: id("org"), createdAt: t });
    await db.insert(schema.members).values([
      { id: id("m1"), organizationId: id("org"), userId: owner, role: "owner", createdAt: t },
      { id: id("m2"), organizationId: id("org"), userId: viewerId, role: "member", createdAt: t },
    ]);
    workspace = (
      await db
        .insert(schema.workspaces)
        .values({ id: ws, organizationId: id("org"), slug: id("ws"), name: "Horizon" })
        .returning()
    )[0]!;
    oppId = await setup.createFromTemplate(me, workspace, "cohort");
    const opp = (await db.query.opportunities.findFirst({
      where: eq(schema.opportunities.id, oppId),
    }))!;
    await db
      .update(schema.opportunities)
      .set({ status: "open", title: "2027 Horizon Fellowship" })
      .where(eq(schema.opportunities.id, oppId));
    const stages = await db
      .select()
      .from(schema.pipelineStages)
      .where(eq(schema.pipelineStages.pipelineId, opp.pipelineId));
    stage = Object.fromEntries(stages.map((s) => [s.key, s.id]));
    const cohort = (await db.query.opportunityCohorts.findFirst({
      where: eq(schema.opportunityCohorts.opportunityId, oppId),
    }))!;
    const people = ["Maya Chen", "Noah Patel", "Priya Nair"];
    for (const [i, name] of people.entries()) {
      const [c] = await db
        .insert(schema.contacts)
        .values({ id: id(`c${i}`), workspaceId: ws, email: `${id(`p${i}`)}@example.test`, name })
        .returning();
      await db.insert(schema.applications).values({
        id: id(`a${i}`),
        workspaceId: ws,
        opportunityId: oppId,
        cohortId: cohort.id,
        contactId: c!.id,
        stageId: stage.applied!,
        stageEnteredAt: t,
        state: "active",
        submittedAt: t,
      });
      apps.push(id(`a${i}`));
    }
    await db
      .insert(schema.opportunityMembers)
      .values({ workspaceId: ws, opportunityId: oppId, userId: viewerId, role: "viewer" });
    viewer = {
      userId: viewerId,
      workspaceId: ws,
      workspaceRole: "member",
      opportunityRoles: new Map([[oppId, "viewer"]]),
    } as unknown as Actor;
    reviewer = {
      ...viewer,
      opportunityRoles: new Map([[oppId, "reviewer"]]),
    } as unknown as Actor;
  });

  afterAll(async () => {
    if (!db) return;
    await db.delete(schema.organizations).where(eq(schema.organizations.id, id("org")));
    await db.delete(schema.users).where(inArray(schema.users.id, [owner, viewerId]));
  });

  const appRow = (appId: string) =>
    db.query.applications.findFirst({ where: eq(schema.applications.id, appId) });

  it("shows the board to the team and to no one else", async () => {
    const board = (await pipeline.boardData(me, oppId))!;
    expect(board.cards.map((c) => c.name).sort()).toEqual([
      "Maya Chen",
      "Noah Patel",
      "Priya Nair",
    ]);
    expect(board.stages.map((s) => s.key)).toContain("in_review");
    const seen = (await pipeline.boardData(viewer, oppId))!;
    expect(seen.cards).toHaveLength(3);
    expect(seen.attention).toEqual([]);
    const stranger = { ...me, workspaceId: id("other"), workspaceRole: "member" } as Actor;
    expect(
      await pipeline.boardData({ ...stranger, opportunityRoles: new Map() } as Actor, oppId),
    ).toBeNull();
  });

  it("gives viewers the application and its contact details, never adjustments or reviews", async () => {
    // ADR 0005: viewers see answers, documents and contact details; not accommodations.
    const d = (await pipeline.applicationDetail(viewer, apps[0]!))!;
    expect(d.contact.name).toBe("Maya Chen");
    expect(d.contact.email).toContain("@example.test");
    expect(d.hasAccommodations).toBe(false);
    expect(d.reviews).toMatchObject({ total: 0, submitted: 0 });
    expect(d.checks).toEqual([]);
  });

  it("moves between open stages: history, rules, an audit and ids only out", async () => {
    sent.events.length = 0;
    const r = await pipeline.moveApplications(me, workspace, oppId, [apps[0]!], stage.in_review!);
    expect(r).toEqual({ ok: true, moved: 1 });
    expect((await appRow(apps[0]!))!.stageId).toBe(stage.in_review);
    const [t] = await db
      .select()
      .from(schema.stageTransitions)
      .where(eq(schema.stageTransitions.subjectId, apps[0]!));
    expect(t).toMatchObject({
      subjectType: "application",
      toStageId: stage.in_review,
      actorType: "user",
    });
    expect(sent.audit.at(-1)).toMatchObject({ action: "application.moved" });
    const ev = sent.events.find((e) => e.event === "application.stage_changed")!;
    expect(ev.payload).toEqual({
      id: apps[0],
      opportunityId: oppId,
      from: { key: "applied", category: "open" },
      to: { key: "in_review", category: "open" },
      by: "user",
    });
    expect(JSON.stringify(ev.payload)).not.toContain("Maya");
  });

  it("asks before leaving a stage with reviews missing, and audits Move anyway", async () => {
    const r = await pipeline.moveApplications(me, workspace, oppId, [apps[0]!], stage.interview!);
    expect(r).toMatchObject({
      ok: false,
      checks: [
        { applicationId: apps[0], name: "Maya Chen", checks: [{ text: "3 of 3 reviews missing" }] },
      ],
    });
    expect((await appRow(apps[0]!))!.stageId).toBe(stage.in_review);
    sent.audit.length = 0;
    const forced = await pipeline.moveApplications(
      me,
      workspace,
      oppId,
      [apps[0]!],
      stage.interview!,
      {
        override: true,
      },
    );
    expect(forced).toEqual({ ok: true, moved: 1 });
    expect(sent.audit.map((a) => a.action)).toEqual([
      "application.moved",
      "application.exit_check_overridden",
    ]);
    expect(sent.audit[1]!.changes).toMatchObject({ check: { to: "reviews_missing" } });
  });

  it("refuses outcomes and people who only view or review", async () => {
    const r = await pipeline.moveApplications(me, workspace, oppId, [apps[1]!], stage.admitted!);
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/records a decision/) });
    expect((await appRow(apps[1]!))!.stageId).toBe(stage.applied);
    await expect(
      pipeline.moveApplications(viewer, workspace, oppId, [apps[1]!], stage.in_review!),
    ).rejects.toThrow();
    await expect(
      pipeline.moveApplications(reviewer, workspace, oppId, [apps[1]!], stage.in_review!),
    ).rejects.toThrow();
    // Ids from elsewhere are ignored, not moved.
    expect(
      await pipeline.moveApplications(me, workspace, oppId, ["nope"], stage.in_review!),
    ).toEqual({ ok: true, moved: 0 });
  });

  it("never moves anyone out of a decision, or on an archived opportunity", async () => {
    // A decision (H6) put them in an outcome; a move can't undo it.
    await db
      .update(schema.applications)
      .set({ stageId: stage.not_selected! })
      .where(eq(schema.applications.id, apps[1]!));
    const r = await pipeline.moveApplications(me, workspace, oppId, [apps[1]!], stage.in_review!);
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/recorded decision/) });
    await db
      .update(schema.applications)
      .set({ stageId: stage.applied! })
      .where(eq(schema.applications.id, apps[1]!));
    await db
      .update(schema.opportunities)
      .set({ status: "archived" })
      .where(eq(schema.opportunities.id, oppId));
    expect(
      await pipeline.moveApplications(me, workspace, oppId, [apps[1]!], stage.in_review!),
    ).toMatchObject({ ok: false, error: expect.stringMatching(/archived/) });
    await db
      .update(schema.opportunities)
      .set({ status: "open" })
      .where(eq(schema.opportunities.id, oppId));
  });

  it("clears a requirement flag with an audit, coordinators only", async () => {
    await db
      .update(schema.applications)
      .set({ flags: [flag("Eligible to work in the EU")] })
      .where(eq(schema.applications.id, apps[2]!));
    const board = (await pipeline.boardData(me, oppId))!;
    expect(board.attention.map((a) => a.id)).toContain("flagged");
    await expect(
      pipeline.clearFlag(viewer, apps[2]!, "Eligible to work in the EU"),
    ).rejects.toThrow();
    await pipeline.clearFlag(me, apps[2]!, "Eligible to work in the EU");
    expect((await appRow(apps[2]!))!.flags).toEqual([]);
    expect(sent.audit.at(-1)).toMatchObject({
      action: "application.flag_cleared",
      changes: { flag: { from: "Eligible to work in the EU" } },
    });
  });

  it("runs stage rules for applications and never reaches an outcome", async () => {
    const opp = (await db.query.opportunities.findFirst({
      where: eq(schema.opportunities.id, oppId),
    }))!;
    // Saved straight to the table: the editor refuses these, the runner must too.
    const [rule] = await db
      .insert(schema.stageRules)
      .values({
        workspaceId: ws,
        pipelineId: opp.pipelineId,
        stageId: stage.in_review!,
        name: "Fast track",
        trigger: { on: "enter" },
        actions: [
          { type: "add_tag", tag: "Fast-Track" },
          { type: "move_to_stage", stageKey: "admitted" },
          { type: "notify_team", who: "coordinators", text: "Someone new in review" },
          { type: "assign_reviewers" },
        ],
      })
      .returning();
    await pipeline.moveApplications(me, workspace, oppId, [apps[1]!], stage.in_review!);
    const [scheduled] = await db
      .select()
      .from(schema.stageRuleRuns)
      .where(
        and(
          eq(schema.stageRuleRuns.ruleId, rule!.id),
          eq(schema.stageRuleRuns.subjectId, apps[1]!),
        ),
      );
    expect(sent.jobs.map((j) => j.runId)).toContain(scheduled!.id);
    await rules.runRule(scheduled!.id);
    const runRow = (await db.query.stageRuleRuns.findFirst({
      where: eq(schema.stageRuleRuns.id, scheduled!.id),
    }))!;
    expect(runRow.status).toBe("done");
    expect(runRow.results).toEqual(["done", "skipped:outcome", "done", "skipped:not_yet"]);
    // The creator coordinates the opportunity.
    expect(sent.notify).toContainEqual({ userId: owner, kind: "automation" });
    const after = (await appRow(apps[1]!))!;
    expect(after.stageId).toBe(stage.in_review);
    expect(after.tags).toEqual(["fast-track"]);
    expect(sent.audit.at(-1)).toMatchObject({ action: "stage_rule.ran" });
  });

  it("moves between open stages from a rule, as the rule", async () => {
    const opp = (await db.query.opportunities.findFirst({
      where: eq(schema.opportunities.id, oppId),
    }))!;
    await db
      .update(schema.stageRules)
      .set({ active: false })
      .where(eq(schema.stageRules.stageId, stage.in_review!));
    const [rule] = await db
      .insert(schema.stageRules)
      .values({
        workspaceId: ws,
        pipelineId: opp.pipelineId,
        stageId: stage.applied!,
        name: "Skip review for alumni",
        trigger: { on: "leave" },
        conditions: {
          match: "all",
          conditions: [{ fieldId: "tags", op: "equals", value: "alumni" }],
        },
        actions: [{ type: "move_to_stage", stageKey: "interview" }],
      })
      .returning();
    await db
      .update(schema.applications)
      .set({ tags: ["alumni"] })
      .where(eq(schema.applications.id, apps[2]!));
    await pipeline.moveApplications(me, workspace, oppId, [apps[2]!], stage.in_review!);
    const runs = await db
      .select()
      .from(schema.stageRuleRuns)
      .where(
        and(
          eq(schema.stageRuleRuns.ruleId, rule!.id),
          eq(schema.stageRuleRuns.subjectId, apps[2]!),
        ),
      );
    expect(runs).toHaveLength(1);
    await rules.runRule(runs[0]!.id);
    expect((await appRow(apps[2]!))!.stageId).toBe(stage.interview);
    const last = await db
      .select()
      .from(schema.stageTransitions)
      .where(
        and(
          eq(schema.stageTransitions.subjectId, apps[2]!),
          eq(schema.stageTransitions.toStageId, stage.interview!),
        ),
      );
    expect(last[0]).toMatchObject({ actorType: "rule", actorId: rule!.id, depth: 1 });
  });
});
