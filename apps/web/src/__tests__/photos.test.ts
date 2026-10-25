import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createDb, eq, inArray, schema, type Database } from "@bookly/db";

/*
 * One photo per person (founder brief item 8): provider pictures are fetched only from the sign-in
 * providers' hosts, and booking pages follow the account photo unless they chose their own.
 */

process.env.DATABASE_URL ??= "postgres://x:y@localhost:5432/x";
process.env.AUTH_SECRET ??= "test-secret-test-secret-test-secret-00";
process.env.APP_URL ??= "http://localhost:3002";

vi.mock("@/server/cache", () => ({ refreshWorkspace: () => {}, workspaceTag: (id: string) => id }));

describe("provider pictures", () => {
  it("are recognised only on the sign-in providers' https hosts", async () => {
    const { providerPhoto } = await import("@/server/photos");
    expect(providerPhoto("https://lh3.googleusercontent.com/a/abc=s96-c")?.hostname).toBe(
      "lh3.googleusercontent.com",
    );
    expect(providerPhoto("https://avatars.githubusercontent.com/u/1?v=4")).not.toBeNull();
    for (const no of [
      "http://lh3.googleusercontent.com/a/abc",
      "https://evil.example/googleusercontent.com/x",
      "https://googleusercontent.com.evil.example/x",
      "https://169.254.169.254/latest/meta-data",
      "/files/123",
      "",
      null,
    ])
      expect(providerPhoto(no), String(no)).toBeNull();
  });
});

const url = process.env.DATABASE_URL;
const realDb = !!url && !url.includes("x:y@");

describe.skipIf(!realDb)("the account photo (seeded database)", () => {
  let db: Database;
  const run = crypto.randomUUID().slice(0, 8);
  const id = (k: string) => `ph_${run}_${k}`;
  const user = id("user");

  beforeAll(async () => {
    db = createDb(url!);
    const t = new Date();
    await db.insert(schema.users).values({
      id: user,
      name: "Pia Photo",
      email: `${user}@example.test`,
      emailVerified: true,
      image: "/files/old",
      createdAt: t,
      updatedAt: t,
    });
    await db
      .insert(schema.organizations)
      .values({ id: id("org"), name: "P", slug: id("org"), createdAt: t });
    for (const k of ["follows", "empty", "own"])
      await db.insert(schema.workspaces).values({
        id: id(k),
        organizationId: id("org"),
        slug: id(k),
        name: k,
      });
    await db.insert(schema.profiles).values([
      {
        workspaceId: id("follows"),
        userId: user,
        username: id("u1"),
        displayName: "Pia",
        avatarUrl: "/files/old",
      },
      {
        workspaceId: id("empty"),
        userId: user,
        username: id("u2"),
        displayName: "Pia",
        avatarUrl: null,
      },
      {
        workspaceId: id("own"),
        userId: user,
        username: id("u3"),
        displayName: "Pia",
        avatarUrl: "/files/own",
      },
    ]);
  });

  afterAll(async () => {
    if (!db) return;
    await db.delete(schema.organizations).where(eq(schema.organizations.id, id("org")));
    await db.delete(schema.users).where(inArray(schema.users.id, [user]));
  });

  const pages = async () =>
    Object.fromEntries(
      (
        await db
          .select({ ws: schema.profiles.workspaceId, url: schema.profiles.avatarUrl })
          .from(schema.profiles)
          .where(eq(schema.profiles.userId, user))
      ).map((r) => [r.ws.replace(`ph_${run}_`, ""), r.url]),
    );

  it("moves the booking pages that followed it, and leaves a page's own photo alone", async () => {
    const { setAccountPhoto } = await import("@/server/photos");
    const r = await setAccountPhoto(user, "/files/new");
    expect(r.before).toBe("/files/old");
    expect(await pages()).toEqual({
      follows: "/files/new",
      empty: "/files/new",
      own: "/files/own",
    });
    await setAccountPhoto(user, null);
    expect(await pages()).toEqual({ follows: null, empty: null, own: "/files/own" });
  });
});
