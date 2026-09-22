import { describe, expect, it } from "vitest";

process.env.AUTH_SECRET ??= "test-secret-test-secret-test";
process.env.DATABASE_URL ??= "postgres://x:y@localhost:5432/z";
process.env.APP_URL ??= "http://localhost:3002";

const { brandFor } = await import("@/emails/brand");
const { accentVars, readableOn, workspaceBrand } = await import("@/server/brand");
const ws = (plan: string) =>
  ({
    name: "Acme",
    plan,
    settings: { branding: { logoUrl: "https://acme.example/logo.png", accent: "#336699" } },
  }) as never;

describe("brandFor", () => {
  it("uses the workspace logo and colour, without the Bookly footer, on plans that include branding", () => {
    process.env.TENANCY = "multi";
    const pro = brandFor(ws("pro"));
    expect(pro.logoUrl).toBe("https://acme.example/logo.png");
    expect(pro.accent).toBe("#336699");
    expect(pro.poweredBy).toBe(false);
  });
  it("keeps the Bookly mark and footer on the free plan even if branding is stored", () => {
    process.env.TENANCY = "multi";
    const free = brandFor(ws("free"));
    expect(free.logoUrl).toMatch(/\/logo-mark\.png$/);
    expect(free.accent).toBe("#e8965a");
    expect(free.poweredBy).toBe(true);
  });
});

describe("workspaceBrand", () => {
  it("gives Pro workspaces their own look on pages and hides the Bookly line", () => {
    process.env.TENANCY = "multi";
    const b = workspaceBrand(ws("pro"));
    expect(b).toMatchObject({ own: true, poweredBy: false, accent: "#336699" });
    expect(b.logoUrl).toBe("https://acme.example/logo.png");
    expect(accentVars(b)).toEqual({
      "--primary": "#336699",
      "--primary-foreground": "#ffffff",
      "--ring": "#336699",
    });
  });
  it("keeps Bookly's mark, colour and line on Free, with no page recolouring", () => {
    process.env.TENANCY = "multi";
    const b = workspaceBrand(ws("free"));
    expect(b).toMatchObject({ own: false, poweredBy: true, accent: "#e8965a", logoUrl: null });
    expect(accentVars(b)).toBeUndefined();
  });
  it("treats self-hosted installs as owning their branding", () => {
    process.env.TENANCY = "single";
    expect(workspaceBrand(ws("self-hosted")).poweredBy).toBe(false);
  });
  it("leaves the theme's colours alone until a workspace picks its own", () => {
    process.env.TENANCY = "single";
    const plain = workspaceBrand({ name: "Acme", plan: "self-hosted", settings: {} } as never);
    expect(plain).toMatchObject({ own: true, ownAccent: null, accent: "#e8965a" });
    expect(accentVars(plain)).toBeUndefined();
  });
});

describe("readableOn", () => {
  it("picks dark text on light colours and light text on dark ones", () => {
    expect(readableOn("#ffff00")).toBe("#111111");
    expect(readableOn("#fff")).toBe("#111111");
    expect(readableOn("#1d4ed8")).toBe("#ffffff");
    expect(readableOn("nonsense")).toBe("#ffffff");
  });
});
