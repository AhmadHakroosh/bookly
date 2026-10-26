import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createDb, eq, inArray, schema, type Database } from "@bookly/db";
import type { Workspace } from "@bookly/db/schema";
import { canEnter, solutionsOpenTo } from "@/server/solutions-text";

/*
 * Clients and Hiring as two solutions (ADR 0009, program slice 2.1): who may enter which, every
 * shared module filtered by solution at its one choke point, contacts marked as clients by the
 * client paths only, and a person who is only a candidate never in Clients lists.
 */

process.env.DATABASE_URL ??= "postgres://x:y@localhost:5432/x";
process.env.AUTH_SECRET ??= "test-secret-test-secret-test-secret-00";
process.env.APP_URL ??= "http://localhost:3002";

vi.mock("@/server/cache", () => ({
  refreshWorkspace: () => {},
  refreshWorkspaceBackground: () => {},
  workspaceTag: (id: string) => `workspace:${id}`,
}));
vi.mock("next/cache", () => ({
  cacheTag: () => {},
  cacheLife: () => {},
  updateTag: () => {},
  revalidateTag: () => {},
  revalidatePath: () => {},
}));
vi.mock("@/server/webhooks", () => ({ emitEvent: () => {} }));
vi.mock("@bookly/jobs", () => ({ enqueue: async () => {} }));

describe("who may enter a solution", () => {
  it("owners and admins every enabled one; members by grant; collaborators Hiring only", () => {
    const both = ["clients", "hiring"] as const;
    expect(solutionsOpenTo(both, { role: "owner", grants: [] })).toEqual(both);
    expect(solutionsOpenTo(["clients"], { role: "admin", grants: [] })).toEqual(["clients"]);
    expect(solutionsOpenTo(both, { role: "member", grants: ["clients"] })).toEqual(["clients"]);
    expect(solutionsOpenTo(both, { role: "member", grants: [], onOpportunityTeam: true })).toEqual([
      "hiring",
    ]);
    expect(canEnter("clients", { role: "collaborator", grants: ["clients", "hiring"] })).toBe(
      false,
    );
    expect(canEnter("hiring", { role: "collaborator", grants: ["hiring"] })).toBe(true);
    expect(solutionsOpenTo(["clients"], { role: "member", grants: ["hiring"] })).toEqual([]);
  });

  it("every shared module filters by solution where it lists", async () => {
    // Rendered, never run: a query builder needs no connection to show its SQL.
    const q = createDb(process.env.DATABASE_URL!);
    const ws = { id: "w", settings: {}, plan: "team" } as unknown as Workspace;
    const { visibleThreads } = await import("@/server/messages");
    const { visibleFiles } = await import("@/server/drive");
    const { filterConds } = await import("@/server/tasks");
    const { and } = await import("@bookly/db");
    expect(
      q
        .select()
        .from(schema.threads)
        .where(visibleThreads({ ws, userId: "u" }))
        .toSQL().sql,
    ).toContain('"threads"."solution"');
    expect(
      q
        .select()
        .from(schema.files)
        .where(visibleFiles({ ws, userId: "u" }))
        .toSQL().sql,
    ).toContain('"files"."solution"');
    expect(
      q
        .select()
        .from(schema.tasks)
        .where(and(...filterConds({}, { workspaceId: "w", viewerId: "u", tz: "UTC" })))
        .toSQL().sql,
    ).toContain('"tasks"."solution"');
  });
});

const url = process.env.DATABASE_URL;
const realDb = !!url && !url.includes("x:y@");

describe.skipIf(!realDb)("solutions (seeded database)", () => {
  let db: Database;
  const run = crypto.randomUUID().slice(0, 8);
  const id = (k: string) => `so_${run}_${k}`;
  const ws = id("ws");
  const user = id("user");

  beforeAll(async () => {
    db = createDb(url!);
    const t = new Date();
    await db.insert(schema.users).values({
      id: user,
      name: "Sol",
      email: `${user}@example.test`,
      emailVerified: true,
      createdAt: t,
      updatedAt: t,
    });
    await db
      .insert(schema.organizations)
      .values({ id: id("org"), name: "S", slug: id("org"), createdAt: t });
    await db.insert(schema.members).values({
      id: id("m"),
      organizationId: id("org"),
      userId: user,
      role: "owner",
      createdAt: t,
    });
    await db
      .insert(schema.workspaces)
      .values({ id: ws, organizationId: id("org"), slug: ws, name: "S", plan: "team" });
    await db.insert(schema.workspaceSolutions).values([
      { workspaceId: ws, solution: "clients" },
      { workspaceId: ws, solution: "hiring", disabledAt: t },
    ]);
  });

  afterAll(async () => {
    if (!db) return;
    await db.delete(schema.organizations).where(eq(schema.organizations.id, id("org")));
    await db.delete(schema.users).where(inArray(schema.users.id, [user]));
  });

  it("lists the enabled solutions and opens them by role", async () => {
    const { enabledSolutions, solutionsFor } = await import("@/server/solutions");
    expect(await enabledSolutions(ws)).toEqual(["clients"]);
    expect(await solutionsFor(ws, user, "owner")).toEqual(["clients"]);
    expect(await solutionsFor(ws, user, "member")).toEqual([]);
  });

  it("marks a contact a client on the client paths, and keeps a candidate out of Clients", async () => {
    const { upsertContact } = await import("@/server/contacts");
    const client = await upsertContact(ws, { email: `${id("c")}@example.test`, name: "Cleo" });
    expect(client.clientAt).toBeInstanceOf(Date);
    // A candidate is created by the application flow: no client_at.
    const [cand] = await db
      .insert(schema.contacts)
      .values({ workspaceId: ws, email: `${id("k")}@example.test`, name: "Kai" })
      .returning();
    expect(cand!.clientAt).toBeNull();
    // Booking later on the Clients side makes them a client too.
    const again = await upsertContact(ws, { email: cand!.email });
    expect(again.clientAt).toBeInstanceOf(Date);
  });

  it("never lists a hiring thread in Clients Messages", async () => {
    const [w] = await db.select().from(schema.workspaces).where(eq(schema.workspaces.id, ws));
    const { listThreads } = await import("@/server/messages");
    await db.insert(schema.threads).values([
      { workspaceId: ws, kind: "team", subject: "Client plan", createdBy: user },
      {
        workspaceId: ws,
        kind: "team",
        subject: "Panel notes",
        createdBy: user,
        solution: "hiring",
      },
    ]);
    const threads = await db
      .select()
      .from(schema.threads)
      .where(eq(schema.threads.workspaceId, ws));
    await db
      .insert(schema.threadParticipants)
      .values(threads.map((t) => ({ threadId: t.id, userId: user, workspaceId: ws })));
    const { rows } = await listThreads({ ws: w!, userId: user }, { box: "team" });
    expect(rows.map((r) => r.title)).toEqual(["Client plan"]);
  });
});
