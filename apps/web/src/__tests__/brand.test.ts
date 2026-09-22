import { describe, expect, it } from "vitest";

process.env.AUTH_SECRET ??= "test-secret-test-secret-test";
process.env.DATABASE_URL ??= "postgres://x:y@localhost:5432/z";
process.env.APP_URL ??= "http://localhost:3002";

const { brandFor } = await import("@/emails/brand");
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
