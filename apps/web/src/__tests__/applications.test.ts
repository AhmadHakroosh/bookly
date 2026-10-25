import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createDb, eq, inArray, schema, type Database } from "@bookly/db";
import type { Actor } from "@/server/access/actor";
import {
  applicationWindow,
  identityFields,
  maskEmail,
  mayEdit,
  minutesToComplete,
  statusCard,
  whatHappensNext,
} from "@/server/hiring/apply-text";
import { bindIds, TEMPLATES } from "@/server/hiring/templates";

/*
 * Applying (H2, planning/v2/ux/application-page.md): the window, "What happens next", the status
 * card and the helpers as pure functions; then, against a migrated database, drafts that never
 * reach the team, submit, duplicates, the status link, withdraw, deletion requests and their
 * deadline, recovery without enumeration, editing, the grace period and previews.
 */

process.env.DATABASE_URL ??= "postgres://x:y@localhost:5432/x";
process.env.AUTH_SECRET ??= "test-secret-test-secret-test-secret-00";
process.env.APP_URL ??= "http://localhost:3002";

const sent = vi.hoisted(() => ({
  audit: [] as { action: string }[],
  events: [] as { event: string; payload: Record<string, unknown> }[],
  email: [] as { to: string; subject: string; text: string }[],
  notify: [] as { userId: string; kind: string }[],
}));
vi.mock("@/server/audit", () => ({
  audit: async (a: { action: string }) => void sent.audit.push(a),
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
vi.mock("@/server/limits", async (orig) => ({
  ...(await orig<typeof import("@/server/limits")>()),
  workspaceLimits: () => ({ opportunities: null, collaborators: null }),
  assertWithinLimit: async () => {},
}));
vi.mock("@/server/ratelimit", async (orig) => ({
  ...(await orig<typeof import("@/server/ratelimit")>()),
  rateLimit: async () => ({ ok: true }),
}));
vi.mock("@/server/urls", () => ({ publicBaseUrl: async () => "https://horizon.test" }));
vi.mock("@/server/request", () => ({ clientIp: async () => "203.0.113.7" }));
// Cached reads ("use cache") run as plain functions here.
vi.mock("next/cache", () => ({
  cacheTag: () => {},
  cacheLife: () => {},
  updateTag: () => {},
  revalidateTag: () => {},
  revalidatePath: () => {},
}));

/* ---------------- Pure ---------------- */

const day = (iso: string) => new Date(`${iso}T12:00:00Z`);

describe("the application window", () => {
  const base = { status: "open" as const, graceMinutes: 120, opensAt: null };
  it("opens, schedules and closes by the round's dates", () => {
    const now = day("2026-11-01");
    expect(applicationWindow({ ...base, closesAt: day("2026-11-15"), now })).toBe("open");
    expect(applicationWindow({ ...base, opensAt: day("2026-11-05"), closesAt: null, now })).toBe(
      "scheduled",
    );
    expect(applicationWindow({ ...base, closesAt: day("2026-10-30"), now })).toBe("closed");
    expect(applicationWindow({ ...base, status: "draft", closesAt: null, now })).toBe("closed");
  });

  it("lets a draft started before the close finish during the grace period, and only then", () => {
    const closesAt = new Date("2026-11-15T23:59:00Z");
    const now = new Date("2026-11-16T01:00:00Z");
    const before = new Date("2026-11-15T20:00:00Z");
    expect(applicationWindow({ ...base, closesAt, now, draftStartedAt: before })).toBe("grace");
    expect(
      applicationWindow({
        ...base,
        closesAt,
        now,
        draftStartedAt: new Date("2026-11-16T00:10:00Z"),
      }),
    ).toBe("closed");
    expect(
      applicationWindow({
        ...base,
        closesAt,
        now: new Date("2026-11-16T02:30:00Z"),
        draftStartedAt: before,
      }),
    ).toBe("closed");
    expect(applicationWindow({ ...base, closesAt, now, draftStartedAt: null })).toBe("closed");
  });
});

describe("what happens next", () => {
  it("follows the pipeline and dates: apply, review, interviews, decisions", () => {
    const ids = { $application: "a", $acceptance: "b", $review: "c", $interview: "d" };
    const stages = TEMPLATES.cohort.stages.map((s, i) => ({
      category: s.category,
      isEntry: i === 0,
      modules: bindIds(s.modules, ids),
    }));
    const steps = whatHappensNext(stages, {
      closesAt: day("2026-11-15"),
      decidesBy: day("2026-12-15"),
      timezone: "UTC",
    });
    expect(steps.map((s) => s.title)).toEqual([
      "Apply by Nov 15.",
      "Review, Nov 16–Nov 25.",
      "Interviews, Nov 26–Dec 2.",
      "Decisions by Dec 15.",
    ]);
    expect(steps.at(-1)!.body).toBe("Everyone who applies hears from us, whatever the outcome.");
  });
});

describe("the status card", () => {
  const card = (o: Partial<Parameters<typeof statusCard>[0]>) =>
    statusCard({
      state: "active",
      label: "Submitted",
      category: "open",
      isEntry: true,
      isWaitlist: false,
      decidesBy: "Dec 15",
      withdrawnOn: null,
      ...o,
    });
  it("says what is happening in plain words, never an internal stage", () => {
    expect(card({})).toEqual({
      title: "Submitted",
      body: "We have your application. Nothing to do right now. We'll update you by Dec 15.",
    });
    expect(card({ isEntry: false, label: "Under review" }).body).toBe(
      "People on our team are reading your application. We'll update you by Dec 15.",
    );
    expect(card({ state: "withdrawn", withdrawnOn: "Nov 20" })).toEqual({
      title: "Withdrawn",
      body: "You withdrew your application on Nov 20.",
    });
  });
});

describe("helpers", () => {
  it("masks emails, finds who is applying and guesses the time it takes", () => {
    expect(maskEmail("maya@uni.edu")).toBe("m•••@uni.edu");
    const schema = TEMPLATES.cohort.forms.$application!.schema;
    expect(identityFields(schema)).toMatchObject({ email: { id: "email" }, name: { id: "name" } });
    expect(minutesToComplete(schema)).toBe(15);
  });
  it("lets a candidate edit only while the application is new", () => {
    const base = {
      state: "active" as const,
      isEntry: true,
      submittedReviews: 0,
      window: "open" as const,
    };
    expect(mayEdit(base)).toBe(true);
    expect(mayEdit({ ...base, submittedReviews: 1 })).toBe(false);
    expect(mayEdit({ ...base, isEntry: false })).toBe(false);
    expect(mayEdit({ ...base, state: "withdrawn" })).toBe(false);
    expect(mayEdit({ ...base, window: "closed" })).toBe(false);
  });
});

/* ---------------- Database ---------------- */

const url = process.env.DATABASE_URL;
const realDb = !!url && !url.includes("x:y@");

describe.skipIf(!realDb)("applying (seeded database)", () => {
  let db: Database;
  const run = crypto.randomUUID().slice(0, 8);
  const id = (k: string) => `h2_${run}_${k}`;
  const ws = id("ws");
  const owner = id("owner");
  const me = {
    userId: owner,
    workspaceId: ws,
    workspaceRole: "owner",
    opportunityRoles: new Map(),
  } as unknown as Actor;
  let workspace: typeof schema.workspaces.$inferSelect;
  let apply: typeof import("@/server/hiring/apply");
  let setup: typeof import("@/server/hiring/setup");
  let slug = "";
  let oppId = "";
  const answers = (email: string) => ({ name: "Maya Chen", email });
  const tokenFrom = (text: string) => text.match(/\/applications\/([\w-]+)/)?.[1] ?? "";

  beforeAll(async () => {
    db = createDb(url!);
    apply = await import("@/server/hiring/apply");
    setup = await import("@/server/hiring/setup");
    const now = new Date();
    await db.insert(schema.users).values({
      id: owner,
      name: "Olivia Park",
      email: `${owner}@example.test`,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    });
    await db
      .insert(schema.organizations)
      .values({ id: id("org"), name: "H2", slug: id("org"), createdAt: now });
    await db.insert(schema.members).values({
      id: id("m"),
      organizationId: id("org"),
      userId: owner,
      role: "owner",
      createdAt: now,
    });
    workspace = (
      await db
        .insert(schema.workspaces)
        .values({ id: ws, organizationId: id("org"), slug: id("ws"), name: "Horizon" })
        .returning()
    )[0]!;
    oppId = await setup.createFromTemplate(me, workspace, "blank");
    slug = `${id("round")}`.replace(/_/g, "-");
    await setup.saveBasics(me, oppId, {
      title: "Horizon round",
      cohortName: "",
      type: "custom",
      opensAt: null,
      closesAt: new Date(Date.now() + 10 * 86_400_000),
      decidesBy: new Date(Date.now() + 20 * 86_400_000),
      capacity: null,
      timezone: "UTC",
      slug,
    });
    expect(await setup.publishOpportunity(me, workspace, oppId)).toMatchObject({ ok: true });
  });

  afterAll(async () => {
    if (!db) return;
    await db.delete(schema.organizations).where(eq(schema.organizations.id, id("org")));
    await db.delete(schema.users).where(inArray(schema.users.id, [owner]));
  });

  const contactsNamed = (email: string) =>
    db.select().from(schema.contacts).where(eq(schema.contacts.email, email));

  it("keeps drafts away from the team until they are submitted", async () => {
    const email = `draft-${run}@example.test`;
    const d = await apply.saveDraft(workspace, slug, { token: null, answers: answers(email) });
    expect(d.token).toBeTruthy();
    expect(await contactsNamed(email)).toEqual([]);
    expect(await apply.draftCount(me, oppId)).toBeGreaterThanOrEqual(1);
    const r = await apply.sendResumeLink(workspace, slug, d.token);
    expect(r.sentTo).toBe("d•••@example.test");
    expect(sent.email.at(-1)!.text).toContain(`/apply/${slug}/resume/${d.token}`);
  });

  it("submits: a contact with no client stage, the entry stage, the link, the email, ids only out", async () => {
    const email = `maya-${run}@example.test`;
    const missing = await apply.submitApplication(workspace, slug, {
      token: null,
      answers: answers(email),
      accommodations: "",
      consent: false,
      futureContact: false,
    });
    expect(missing).toEqual({
      ok: false,
      errors: { consent: "Agree to the privacy notice to apply." },
    });
    const r = await apply.submitApplication(workspace, slug, {
      token: null,
      answers: answers(email),
      accommodations: "Captions, please.",
      consent: true,
      futureContact: true,
    });
    expect(r).toMatchObject({ ok: true, email: "m•••@example.test" });
    const [contact] = await contactsNamed(email);
    expect(contact).toMatchObject({ name: "Maya Chen", stageId: null });
    const app = await db.query.applications.findFirst({
      where: eq(schema.applications.contactId, contact!.id),
    });
    expect(app).toMatchObject({ state: "active", futureContact: true, opportunityId: oppId });
    const entry = await db.query.pipelineStages.findFirst({
      where: eq(schema.pipelineStages.id, app!.stageId!),
    });
    expect(entry?.isEntry).toBe(true);
    expect(sent.events.at(-1)).toMatchObject({
      event: "application.submitted",
      payload: { id: app!.id },
    });
    expect(JSON.stringify(sent.events.at(-1))).not.toContain(email);
    expect(sent.notify.at(-1)).toEqual({ userId: owner, kind: "application.submitted" });
    const mail = sent.email.at(-1)!;
    expect(mail.to).toBe(email);
    const token = tokenFrom(mail.text);
    expect(token).toBe((r as { statusToken: string }).statusToken);
    const status = await apply.statusByToken(workspace, token);
    expect(status.kind).toBe("ok");
    if (status.kind === "ok") {
      expect(status.view.label).toBe("Submitted");
      expect(status.view.accommodations).toBe("Captions, please.");
      expect(status.view.editable).toBe(true);
    }
  });

  it("refuses a second application with the same email and sends a fresh link instead", async () => {
    const email = `twice-${run}@example.test`;
    const first = await apply.submitApplication(workspace, slug, {
      token: null,
      answers: answers(email),
      accommodations: "",
      consent: true,
      futureContact: false,
    });
    const again = await apply.submitApplication(workspace, slug, {
      token: null,
      answers: answers(email),
      accommodations: "",
      consent: true,
      futureContact: false,
    });
    expect(again).toEqual({ ok: false, duplicate: true, email: "t•••@example.test" });
    // The old link stops working; the new one, sent by email, opens the application.
    expect(
      (await apply.statusByToken(workspace, (first as { statusToken: string }).statusToken)).kind,
    ).toBe("missing");
    expect((await apply.statusByToken(workspace, tokenFrom(sent.email.at(-1)!.text))).kind).toBe(
      "ok",
    );
  });

  it("edits as a new revision while new, then locks once a review is in", async () => {
    const email = `edit-${run}@example.test`;
    const r = (await apply.submitApplication(workspace, slug, {
      token: null,
      answers: answers(email),
      accommodations: "",
      consent: true,
      futureContact: false,
    })) as { statusToken: string };
    expect(
      await apply.saveEdit(workspace, r.statusToken, {
        draftToken: null,
        answers: { name: "Maya C. Chen", email: "someone-else@example.test" },
      }),
    ).toEqual({ ok: true });
    const status = await apply.statusByToken(workspace, r.statusToken);
    if (status.kind !== "ok") throw new Error("expected the application");
    expect(status.view.revision).toBe(2);
    // The email that identifies the applicant doesn't change through an edit.
    expect(status.view.answers).toMatchObject({ name: "Maya C. Chen", email });
    const app = status.view.application;
    const stage = app.stageId!;
    await db.insert(schema.users).values({
      id: id("rev"),
      name: "Rev",
      email: `${id("rev")}@example.test`,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const [as] = await db
      .insert(schema.reviewAssignments)
      .values({
        workspaceId: ws,
        applicationId: app.id,
        stageId: stage,
        reviewerUserId: id("rev"),
        status: "submitted",
      })
      .returning();
    await db.insert(schema.reviews).values({
      workspaceId: ws,
      assignmentId: as!.id,
      applicationId: app.id,
      stageId: stage,
      reviewerUserId: id("rev"),
      criteria: [],
      status: "submitted",
      submittedAt: new Date(),
    });
    await expect(
      apply.saveEdit(workspace, r.statusToken, { draftToken: null, answers: answers(email) }),
    ).rejects.toThrow(/being reviewed/);
    await db.delete(schema.users).where(eq(schema.users.id, id("rev")));
  });

  it("withdraws, then deletes at the deadline unless someone acts, and says so afterwards", async () => {
    const email = `gone-${run}@example.test`;
    const r = (await apply.submitApplication(workspace, slug, {
      token: null,
      answers: answers(email),
      accommodations: "Extra time",
      consent: true,
      futureContact: false,
    })) as { statusToken: string };
    const req = await apply.requestDeletion(workspace, r.statusToken);
    expect(req).toMatchObject({ status: "open", contactEmail: email });
    expect(sent.email.at(-1)!.subject).toMatch(
      /^We'll delete your application to Horizon round by /,
    );
    const status = await apply.statusByToken(workspace, r.statusToken);
    expect(status.kind === "ok" && status.view.application.state).toBe("withdrawn");
    expect(sent.events.at(-1)?.event).toBe("application.withdrawn");
    // Day 7: the coordinators are reminded; day 31: it is gone.
    await apply.sweepDataRequests(new Date(Date.now() + 8 * 86_400_000));
    const reminded = await db.query.dataRequests.findFirst({
      where: eq(schema.dataRequests.id, req.id),
    });
    expect(reminded?.remindersSent).toEqual(["d7"]);
    await apply.sweepDataRequests(new Date(Date.now() + 31 * 86_400_000));
    expect(await contactsNamed(email)).toEqual([]);
    expect((await apply.statusByToken(workspace, r.statusToken)).kind).toBe("deleted");
    expect(sent.email.at(-1)!.subject).toBe("Your application to Horizon round has been deleted");
  });

  it("keeps the data under a legal hold, and tells the candidate why", async () => {
    const email = `hold-${run}@example.test`;
    const r = (await apply.submitApplication(workspace, slug, {
      token: null,
      answers: answers(email),
      accommodations: "",
      consent: true,
      futureContact: false,
    })) as { statusToken: string };
    const req = await apply.requestDeletion(workspace, r.statusToken);
    await expect(apply.recordLegalHold(me, workspace, req.id, " ")).rejects.toThrow(/Say why/);
    await apply.recordLegalHold(me, workspace, req.id, "an open complaint about this round");
    expect(sent.email.at(-1)!.text).toContain("an open complaint about this round");
    await apply.sweepDataRequests(new Date(Date.now() + 40 * 86_400_000));
    expect((await apply.statusByToken(workspace, r.statusToken)).kind).toBe("ok");
  });

  it("sends new links without saying whether an application exists", async () => {
    const before = sent.email.length;
    expect(await apply.recoverLinks(workspace, `nobody-${run}@example.test`, "1.2.3.4")).toBe(
      "sent",
    );
    expect(sent.email.length).toBe(before);
    expect(await apply.recoverLinks(workspace, `maya-${run}@example.test`, "1.2.3.4")).toBe("sent");
    expect(sent.email.length).toBe(before + 1);
  });

  it("shows a draft opportunity only with its preview token, and stops after the grace period", async () => {
    const draftOpp = await setup.createFromTemplate(me, workspace, "blank");
    const [o] = await db
      .select()
      .from(schema.opportunities)
      .where(eq(schema.opportunities.id, draftOpp));
    expect(await apply.publicOpportunity(workspace, o!.slug)).toBeNull();
    expect(await apply.publicOpportunity(workspace, o!.slug, { preview: "wrong" })).toBeNull();
    expect(
      await apply.publicOpportunity(workspace, o!.slug, { preview: apply.previewToken(draftOpp) }),
    ).toMatchObject({ preview: true });
    // Close the live round an hour ago: a draft from before may still be sent, a new one may not.
    const email = `late-${run}@example.test`;
    const d = await apply.saveDraft(workspace, slug, { token: null, answers: answers(email) });
    await db
      .update(schema.opportunityCohorts)
      .set({ closesAt: new Date(Date.now() - 3600_000) })
      .where(eq(schema.opportunityCohorts.opportunityId, oppId));
    await expect(
      apply.submitApplication(workspace, slug, {
        token: null,
        answers: answers(`new-${run}@example.test`),
        accommodations: "",
        consent: true,
        futureContact: false,
      }),
    ).rejects.toThrow(/aren't open/);
    await db
      .update(schema.formResponses)
      .set({ createdAt: new Date(Date.now() - 2 * 3600_000) })
      .where(
        eq(
          schema.formResponses.resumeTokenHash,
          (await import("node:crypto")).createHash("sha256").update(d.token).digest("hex"),
        ),
      );
    expect(
      await apply.submitApplication(workspace, slug, {
        token: d.token,
        answers: answers(email),
        accommodations: "",
        consent: true,
        futureContact: false,
      }),
    ).toMatchObject({ ok: true });
  });

  const reopen = () =>
    db
      .update(schema.opportunityCohorts)
      .set({ closesAt: new Date(Date.now() + 10 * 86_400_000) })
      .where(eq(schema.opportunityCohorts.opportunityId, oppId));

  it("keeps outcomes out of the download until released, and links out of greetings", async () => {
    await reopen();
    expect(apply.plainName("Maya Chen")).toBe("Maya Chen");
    for (const n of [
      "win at https://x.io",
      "www.prize.example",
      "a@b.co",
      "<b>hi</b>",
      "visit bit.ly",
    ])
      expect(apply.plainName(n)).toBe("there");
    const email = `outcome-${run}@example.test`;
    const r = (await apply.submitApplication(workspace, slug, {
      token: null,
      answers: answers(email),
      accommodations: "",
      consent: true,
      futureContact: false,
    })) as { statusToken: string };
    const status = await apply.statusByToken(workspace, r.statusToken);
    if (status.kind !== "ok") throw new Error("expected the application");
    const [opp] = await db
      .select()
      .from(schema.opportunities)
      .where(eq(schema.opportunities.id, oppId));
    const lost = await db.query.pipelineStages.findFirst({
      where: (t, { and: a, eq: e }) => a(e(t.pipelineId, opp!.pipelineId), e(t.category, "lost")),
    });
    await db
      .update(schema.applications)
      .set({ stageId: lost!.id })
      .where(eq(schema.applications.id, status.view.application.id));
    expect((await apply.exportOwnData(workspace, r.statusToken)).status).toBe("Under review");
  });

  it("keeps a person who is more than this application when it is deleted", async () => {
    await reopen();
    const email = `client-${run}@example.test`;
    const r = (await apply.submitApplication(workspace, slug, {
      token: null,
      answers: answers(email),
      accommodations: "",
      consent: true,
      futureContact: false,
    })) as { statusToken: string };
    const [contact] = await contactsNamed(email);
    // The team already writes to this person in Messages.
    await db
      .insert(schema.threads)
      .values({ workspaceId: ws, contactId: contact!.id, kind: "guest" });
    const req = await apply.requestDeletion(workspace, r.statusToken);
    await apply.deleteNow(me, workspace, req.id);
    expect(await contactsNamed(email)).toHaveLength(1);
    expect((await apply.statusByToken(workspace, r.statusToken)).kind).toBe("deleted");
  });

  it("says the answers stand once the deadline passed, rather than 'being reviewed'", async () => {
    await reopen();
    const email = `late-edit-${run}@example.test`;
    const r = (await apply.submitApplication(workspace, slug, {
      token: null,
      answers: answers(email),
      accommodations: "",
      consent: true,
      futureContact: false,
    })) as { statusToken: string };
    await db
      .update(schema.opportunityCohorts)
      .set({ closesAt: new Date(Date.now() - 3 * 3600_000) })
      .where(eq(schema.opportunityCohorts.opportunityId, oppId));
    const status = await apply.statusByToken(workspace, r.statusToken);
    if (status.kind !== "ok") throw new Error("expected the application");
    expect(status.view).toMatchObject({ editable: false, closedForEdits: true });
    await reopen();
  });
});
