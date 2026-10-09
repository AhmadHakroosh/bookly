import { describe, expect, it, vi } from "vitest";

/** The env loader caches, so each case sets the environment and imports a fresh module. */
async function load(env: Record<string, string>) {
  vi.resetModules();
  Object.assign(process.env, {
    AUTH_SECRET: "test-secret-test-secret-test",
    DATABASE_URL: "postgres://x:y@localhost:5432/z",
    ...env,
  });
  return import("@/server/short-links");
}

describe("short links", () => {
  it("accepts manage tokens and booking ids only in their own shapes", async () => {
    const { looksLikeManageToken, looksLikeBookingId } = await load({});
    expect(looksLikeManageToken("A".repeat(40))).toBe(true);
    expect(looksLikeManageToken("abc-DEF_0123456789abcdef")).toBe(true);
    expect(looksLikeManageToken("short")).toBe(false);
    expect(looksLikeManageToken("has space ".padEnd(30, "x"))).toBe(false);
    expect(looksLikeBookingId("8b2a6e2a-1c3d-4e5f-8a9b-0c1d2e3f4a5b")).toBe(true);
    expect(looksLikeBookingId("8b2a6e2a1c3d4e5f8a9b0c1d2e3f4a5b")).toBe(false);
  });
  it("sends /h/admin to the workspace chooser on the cloud and to the admin when self-hosted", async () => {
    const cloud = await load({
      TENANCY: "multi",
      ROOT_DOMAIN: "bookly.test",
      APP_URL: "https://bookly.test",
    });
    expect(await cloud.hostBookingUrl("admin")).toBe("https://bookly.test/workspaces");
    const single = await load({ TENANCY: "single", APP_URL: "http://localhost:3002" });
    expect(await single.hostBookingUrl("admin")).toBe("http://localhost:3002/admin");
  });
  it("rejects malformed ids before touching the database", async () => {
    const { guestBookingUrl, hostBookingUrl } = await load({
      TENANCY: "single",
      APP_URL: "http://localhost:3002",
    });
    expect(await guestBookingUrl("nope")).toBeNull();
    expect(await hostBookingUrl("not-a-uuid")).toBeNull();
  });
});
