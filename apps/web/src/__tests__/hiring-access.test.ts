import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, createDb, eq, inArray, schema, type Database } from "@bookly/db";
import type { OpportunityRole } from "@bookly/db/schema";
import {
  applicationsVisibleTo,
  assertTeamRoleAllowed,
  bookingsVisibleTo,
  canOnOpportunity,
  contactEventsVisibleTo,
  contactsVisibleTo,
  filesVisibleToHiring,
  redactInterview,
  reviewsVisibleTo,
  roleOn,
} from "@/server/access/hiring";
import type { Actor } from "@/server/access/actor";

/*
 * Hiring access (ADR 0005, slice S9): the write checks, and the read predicates run as a matrix
 * against a seeded database (one opportunity, one person per role, assigned and unassigned
 * applications, draft and submitted reviews). The database part runs wherever DATABASE_URL points
 * at a migrated database (CI's check job does); it seeds its own workspace and removes it after.
 */

const actor = (
  userId: string,
  workspaceRole: string,
  roles: Record<string, OpportunityRole> = {},
  workspaceId = "ws",
): Actor =>
  ({
    userId,
    workspaceId,
    workspaceRole,
    opportunityRoles: new Map(Object.entries(roles)),
  }) as Actor;

describe("hiring write checks", () => {
  it("lets owners and admins coordinate every opportunity", () => {
    expect(roleOn(actor("u", "owner"), "o1")).toBe("coordinator");
    expect(roleOn(actor("u", "admin"), "o1")).toBe("coordinator");
    expect(roleOn(actor("u", "member"), "o1")).toBeNull();
  });

  it("gives coordinators the whole matrix and everyone else viewing only", () => {
    const c = actor("u", "member", { o1: "coordinator" });
    for (const a of ["application.move", "decision.record", "opportunity.manage_team"] as const)
      expect(canOnOpportunity(c, "o1", a)).toBe(true);
    for (const role of ["reviewer", "interviewer", "viewer"] as const) {
      const r = actor("u", "member", { o1: role });
      expect(canOnOpportunity(r, "o1", "opportunity.view")).toBe(true);
      expect(canOnOpportunity(r, "o1", "decision.record")).toBe(false);
      expect(canOnOpportunity(r, "o1", "application.message")).toBe(false);
    }
    expect(canOnOpportunity(c, "o2", "opportunity.view")).toBe(false);
  });

  it("never lets a collaborator coordinate, and says how to fix it", () => {
    expect(() => assertTeamRoleAllowed("collaborator", "coordinator")).toThrow(/member seat/);
    expect(() => assertTeamRoleAllowed("collaborator", "reviewer")).not.toThrow();
    expect(() => assertTeamRoleAllowed("member", "coordinator")).not.toThrow();
  });

  it("shows an interview to outsiders as its time and host only", () => {
    const b = redactInterview({
      attendeeName: "Maya Chen",
      attendeeEmail: "maya@example.com",
      attendeePhone: "+1",
      notes: "n",
      answers: { q: "a" },
      guests: ["x@example.com"],
      contactId: "c",
      applicationId: "a",
      brief: "b",
      meetingUrl: "https://meet",
      stageId: "s",
      manageToken: "tok",
      cancelReason: "r",
      paymentRef: { receiptUrl: "https://receipt" },
      hostUserId: "h",
    });
    expect(b).toMatchObject({
      attendeeName: "Interview",
      attendeeEmail: "",
      contactId: null,
      applicationId: null,
      answers: {},
      guests: [],
      brief: null,
      meetingUrl: null,
      manageToken: "",
      paymentRef: null,
      hostUserId: "h",
    });
  });
});

describe("hiring read guard", () => {
  it("never hands an access predicate to a relational query (they alias the table it names)", () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((f) => {
        const p = path.join(dir, f);
        if (statSync(p).isDirectory()) return f === "__tests__" ? [] : walk(p);
        return /\.(ts|tsx)$/.test(f) ? [p] : [];
      });
    const offenders: string[] = [];
    for (const file of walk(path.join(__dirname, ".."))) {
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(/\.query\.\w+\.find(?:First|Many)\(/g)) {
        // The call's arguments: up to the matching close paren.
        let depth = 0;
        let end = m.index! + m[0].length - 1;
        for (; end < src.length; end++) {
          if (src[end] === "(") depth++;
          else if (src[end] === ")" && --depth === 0) break;
        }
        const call = src.slice(m.index!, end);
        if (/VisibleTo\(|canSeeApplication\(/.test(call))
          offenders.push(path.relative(path.join(__dirname, ".."), file));
      }
    }
    expect(offenders).toEqual([]);
  });

  it("takes the actor first in every exported hiring query", () => {
    const src = readFileSync(path.join(__dirname, "../server/hiring/queries.ts"), "utf8");
    const exported = [...src.matchAll(/^export async function (\w+)\(([^,)]*)/gm)];
    expect(exported.length).toBeGreaterThan(0);
    for (const [, name, first] of exported)
      expect(first!.trim(), `${name} takes the actor first`).toMatch(/^actor: Actor$/);
  });
});

const url = process.env.DATABASE_URL;
const realDb = !!url && !url.includes("x:y@");

describe.skipIf(!realDb)("hiring access matrix (seeded database)", () => {
  let db: Database;
  const run = crypto.randomUUID().slice(0, 8);
  const id = (k: string) => `s9_${run}_${k}`;
  const ws = id("ws");
  const users = ["owner", "coord", "rev1", "rev2", "viewer", "inter", "collab", "outsider"].map(
    (k) => id(k),
  );
  const [owner, coord, rev1, rev2, viewer, inter, collab, outsider] = users as [
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  const opp = id("opp");
  const stage = id("stage");
  const [p1, p2, p3] = [id("p1"), id("p2"), id("p3")];
  const [a1, a2] = [id("a1"), id("a2")];
  const roles: Record<string, OpportunityRole> = {
    [coord]: "coordinator",
    [rev1]: "reviewer",
    [rev2]: "reviewer",
    [viewer]: "viewer",
    [inter]: "interviewer",
    [collab]: "reviewer",
  };
  const actorOf = (u: string) =>
    actor(
      u,
      u === owner ? "owner" : u === collab ? "collaborator" : "member",
      roles[u] ? { [opp]: roles[u] } : {},
      ws,
    );

  beforeAll(async () => {
    db = createDb(url!);
    const now = new Date();
    await db.insert(schema.users).values(
      users.map((u) => ({
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
      .values({ id: id("org"), name: "S9", slug: id("org"), createdAt: now });
    await db.insert(schema.members).values(
      users.map((u) => ({
        id: id(`m_${u}`),
        organizationId: id("org"),
        userId: u,
        role: u === owner ? "owner" : u === collab ? "collaborator" : "member",
        createdAt: now,
      })),
    );
    await db
      .insert(schema.workspaces)
      .values({ id: ws, organizationId: id("org"), slug: id("ws"), name: "S9" });
    await db.insert(schema.pipelines).values({
      id: id("pipe"),
      workspaceId: ws,
      kind: "hiring",
      name: "Fellowship",
      template: "cohort",
    });
    await db.insert(schema.pipelineStages).values({
      id: stage,
      workspaceId: ws,
      pipelineId: id("pipe"),
      key: "review",
      name: "In review",
      category: "open",
      color: "#e85d2c",
      position: 1,
      isEntry: true,
    });
    await db.insert(schema.opportunities).values({
      id: opp,
      workspaceId: ws,
      type: "fellowship",
      title: "2027 Fellowship",
      slug: id("slug"),
      pipelineId: id("pipe"),
    });
    await db.insert(schema.opportunityCohorts).values({
      id: id("cohort"),
      workspaceId: ws,
      opportunityId: opp,
      name: "Spring",
      isDefault: true,
    });
    await db.insert(schema.contacts).values([
      { id: p1, workspaceId: ws, email: `${p1}@example.test`, name: "Candidate One" },
      { id: p2, workspaceId: ws, email: `${p2}@example.test`, name: "Candidate Two" },
      { id: p3, workspaceId: ws, email: `${p3}@example.test`, name: "Client", stageId: stage },
    ]);
    await db.insert(schema.applications).values([
      {
        id: a1,
        workspaceId: ws,
        opportunityId: opp,
        cohortId: id("cohort"),
        contactId: p1,
        stageId: stage,
        state: "active",
      },
      {
        id: a2,
        workspaceId: ws,
        opportunityId: opp,
        cohortId: id("cohort"),
        contactId: p2,
        stageId: stage,
        state: "active",
      },
    ]);
    await db.insert(schema.opportunityMembers).values(
      Object.entries(roles).map(([userId, role]) => ({
        workspaceId: ws,
        opportunityId: opp,
        userId,
        role,
      })),
    );
    await db.insert(schema.applicationAccess).values([
      { workspaceId: ws, applicationId: a1, userId: rev1, reason: "review" },
      { workspaceId: ws, applicationId: a1, userId: rev2, reason: "review" },
      { workspaceId: ws, applicationId: a2, userId: inter, reason: "interview" },
    ]);
    await db.insert(schema.reviewAssignments).values([
      { id: id("as1"), workspaceId: ws, applicationId: a1, stageId: stage, reviewerUserId: rev1 },
      {
        id: id("as2"),
        workspaceId: ws,
        applicationId: a1,
        stageId: stage,
        reviewerUserId: rev2,
        status: "submitted",
      },
    ]);
    await db.insert(schema.reviews).values({
      id: id("rv2"),
      workspaceId: ws,
      assignmentId: id("as2"),
      applicationId: a1,
      stageId: stage,
      reviewerUserId: rev2,
      criteria: [],
      status: "submitted",
      submittedAt: now,
    });
    await db.insert(schema.contactEvents).values([
      { id: id("e_client"), workspaceId: ws, contactId: p3, type: "note", summary: "client note" },
      {
        id: id("e_a1"),
        workspaceId: ws,
        contactId: p1,
        type: "note",
        summary: "applied",
        applicationId: a1,
      },
    ]);
  });

  afterAll(async () => {
    if (!db) return;
    await db.delete(schema.organizations).where(eq(schema.organizations.id, id("org")));
    await db.delete(schema.users).where(inArray(schema.users.id, users));
  });

  const visibleApps = async (u: string) =>
    (
      await db
        .select({ id: schema.applications.id })
        .from(schema.applications)
        .where(and(eq(schema.applications.workspaceId, ws), applicationsVisibleTo(actorOf(u))))
    )
      .map((r) => r.id)
      .sort();

  it("lets each role list exactly the applications the matrix allows", async () => {
    const expected: [string, string[]][] = [
      [owner, [a1, a2]],
      [coord, [a1, a2]],
      [viewer, [a1, a2]],
      [rev1, [a1]],
      [rev2, [a1]],
      [inter, [a2]],
      [collab, []],
      [outsider, []],
    ];
    for (const [u, apps] of expected) expect(await visibleApps(u), u).toEqual(apps.sort());
  });

  it("opens every application to reviewers when the opportunity is open to the whole team", async () => {
    await db
      .update(schema.opportunities)
      .set({ settings: { assignedReviewersOnly: false } })
      .where(eq(schema.opportunities.id, opp));
    expect(await visibleApps(rev1)).toEqual([a1, a2].sort());
    expect(await visibleApps(collab)).toEqual([a1, a2].sort());
    expect(await visibleApps(inter)).toEqual([a2]);
    await db
      .update(schema.opportunities)
      .set({ settings: {} })
      .where(eq(schema.opportunities.id, opp));
  });

  it("hides people who exist only as candidates from everyone outside their team", async () => {
    const seen = async (u: string | null) =>
      (
        await db
          .select({ id: schema.contacts.id })
          .from(schema.contacts)
          .where(and(eq(schema.contacts.workspaceId, ws), contactsVisibleTo(u)))
      )
        .map((r) => r.id)
        .sort();
    expect(await seen(coord)).toEqual([p1, p2, p3].sort());
    expect(await seen(rev1)).toEqual([p1, p3].sort());
    expect(await seen(outsider)).toEqual([p3]);
    expect(await seen(null)).toEqual([p3]);
  });

  it("keeps hiring timeline entries to the application's team, and from code with no viewer", async () => {
    const seen = async (u: string | null) =>
      (
        await db
          .select({ id: schema.contactEvents.id })
          .from(schema.contactEvents)
          .where(and(eq(schema.contactEvents.workspaceId, ws), contactEventsVisibleTo(u)))
      )
        .map((r) => r.id)
        .sort();
    expect(await seen(rev1)).toEqual([id("e_a1"), id("e_client")].sort());
    expect(await seen(inter)).toEqual([id("e_client")]);
    expect(await seen(null)).toEqual([id("e_client")]);
  });

  it("applies the same rule to interviews in booking lists", async () => {
    const at = new Date(Date.now() + 86_400_000);
    const end = new Date(at.getTime() + 1_800_000);
    const booking = (key: string, applicationId: string | null) => ({
      id: id(key),
      workspaceId: ws,
      hostUserId: inter,
      startAt: at,
      endAt: end,
      timezone: "UTC",
      attendeeName: key,
      attendeeEmail: `${key}@example.test`,
      manageToken: id(`tok_${key}`),
      applicationId,
    });
    await db.insert(schema.bookings).values([booking("interview", a1), booking("client", null)]);
    const seen = async (u: string | null) =>
      (
        await db
          .select({ id: schema.bookings.id })
          .from(schema.bookings)
          .where(and(eq(schema.bookings.workspaceId, ws), bookingsVisibleTo(u)))
      )
        .map((r) => r.id)
        .sort();
    expect(await seen(rev1)).toEqual([id("client"), id("interview")].sort());
    expect(await seen(inter)).toEqual([id("client")]);
    expect(await seen(null)).toEqual([id("client")]);
  });

  it("keeps reviews independent until the reviewer has submitted their own", async () => {
    const reviewsSeen = async (u: string, opts: { viewersSeeReviews?: boolean } = {}) =>
      (
        await db
          .select({ id: schema.reviews.id })
          .from(schema.reviews)
          .where(reviewsVisibleTo(actorOf(u), { id: a1, opportunityId: opp }, opts))
      ).map((r) => r.id);
    expect(await reviewsSeen(rev1)).toEqual([]);
    expect(await reviewsSeen(rev2)).toEqual([id("rv2")]);
    expect(await reviewsSeen(coord)).toEqual([id("rv2")]);
    expect(await reviewsSeen(owner)).toEqual([id("rv2")]);
    expect(await reviewsSeen(viewer)).toEqual([]);
    expect(await reviewsSeen(viewer, { viewersSeeReviews: true })).toEqual([id("rv2")]);
    expect(await reviewsSeen(outsider)).toEqual([]);

    // rev1 submits: now they see both.
    await db
      .update(schema.reviewAssignments)
      .set({ status: "submitted" })
      .where(eq(schema.reviewAssignments.id, id("as1")));
    await db.insert(schema.reviews).values({
      id: id("rv1"),
      workspaceId: ws,
      assignmentId: id("as1"),
      applicationId: a1,
      stageId: stage,
      reviewerUserId: rev1,
      criteria: [],
      status: "submitted",
      submittedAt: new Date(),
    });
    expect((await reviewsSeen(rev1)).sort()).toEqual([id("rv1"), id("rv2")].sort());
  });

  it("never lets a stale coordinator row make a collaborator a coordinator", async () => {
    await db
      .update(schema.opportunityMembers)
      .set({ role: "coordinator" })
      .where(eq(schema.opportunityMembers.userId, collab));
    const asCoordinator = actor(collab, "collaborator", { [opp]: "coordinator" }, ws);
    expect(roleOn(asCoordinator, opp)).toBeNull();
    const ids = (
      await db
        .select({ id: schema.applications.id })
        .from(schema.applications)
        .where(and(eq(schema.applications.workspaceId, ws), applicationsVisibleTo(asCoordinator)))
    ).map((r) => r.id);
    expect(ids).toEqual([]);
    await db
      .update(schema.opportunityMembers)
      .set({ role: "reviewer" })
      .where(eq(schema.opportunityMembers.userId, collab));
  });

  it("keeps candidates' files to their team", async () => {
    const file = (key: string, contactId: string | null) => ({
      id: crypto.randomUUID(),
      workspaceId: ws,
      kind: "attachment" as const,
      key: id(`key_${key}`),
      name: `${key}.pdf`,
      mime: "application/pdf",
      size: 10,
      status: "ready" as const,
      contactId,
    });
    const [cv, contract] = [file("cv", p1), file("contract", p3)];
    await db.insert(schema.files).values([cv, contract]);
    const seen = async (u: string | null) =>
      (
        await db
          .select({ id: schema.files.id })
          .from(schema.files)
          .where(and(eq(schema.files.workspaceId, ws), filesVisibleToHiring(u)))
      )
        .map((r) => r.id)
        .sort();
    expect(await seen(rev1)).toEqual([cv.id, contract.id].sort());
    expect(await seen(outsider)).toEqual([contract.id]);
    expect(await seen(null)).toEqual([contract.id]);
  });

  it("blinds a coordinator who owes a review on that stage until they submit", async () => {
    await db.insert(schema.reviewAssignments).values({
      id: id("as_c"),
      workspaceId: ws,
      applicationId: a1,
      stageId: stage,
      reviewerUserId: coord,
    });
    const ids = (
      await db
        .select({ id: schema.reviews.id })
        .from(schema.reviews)
        .where(reviewsVisibleTo(actorOf(coord), { id: a1, opportunityId: opp }))
    ).map((r) => r.id);
    expect(ids).toEqual([]);
  });
});
