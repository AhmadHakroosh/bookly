import { describe, expect, it, vi } from "vitest";

/** The env loader caches, so each case sets the environment and imports a fresh module. */
async function load(env: Record<string, string>) {
  vi.resetModules();
  Object.assign(process.env, {
    AUTH_SECRET: "test-secret-test-secret-test",
    DATABASE_URL: "postgres://x:y@localhost:5432/z",
    ...env,
  });
  return import("@/server/urls");
}
const ws = { id: "ws_1", slug: "acme" };

describe("workspace URLs", () => {
  it("self-host: everything lives on APP_URL, a primary domain does not change links", async () => {
    const { adminBaseUrl, publicOrigin } = await load({
      TENANCY: "single",
      APP_URL: "http://localhost:3002",
    });
    expect(publicOrigin(ws, null)).toBe("http://localhost:3002");
    expect(publicOrigin(ws, "book.example.com")).toBe("http://localhost:3002");
    expect(adminBaseUrl(ws)).toBe("http://localhost:3002");
  });
  it("cloud: guests get the primary domain when verified, otherwise the slug host", async () => {
    const { publicOrigin } = await load({
      TENANCY: "multi",
      ROOT_DOMAIN: "bookly.test",
      APP_URL: "https://bookly.test",
    });
    expect(publicOrigin(ws, null)).toBe("https://acme.bookly.test");
    expect(publicOrigin(ws, "book.example.com")).toBe("https://book.example.com");
    // A stale row naming the platform host never becomes a workspace address.
    expect(publicOrigin(ws, "bookly.test")).toBe("https://acme.bookly.test");
  });
  it("cloud: the admin stays on the slug host, where the session cookie is valid", async () => {
    const { adminBaseUrl } = await load({
      TENANCY: "multi",
      ROOT_DOMAIN: "bookly.test",
      APP_URL: "https://bookly.test",
    });
    expect(adminBaseUrl(ws)).toBe("https://acme.bookly.test");
  });
});
