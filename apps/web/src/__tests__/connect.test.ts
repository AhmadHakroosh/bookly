import { describe, expect, it, vi } from "vitest";

// The real loader caches its first read; these cases flip TENANCY and the Stripe key per test.
vi.mock("@bookly/config", async (orig) => ({
  ...(await orig<typeof import("@bookly/config")>()),
  loadEnv: () => ({ ...process.env }),
}));

process.env.AUTH_SECRET ??= "test-secret-test-secret-test";
process.env.DATABASE_URL ??= "postgres://x:y@localhost:5432/z";
process.env.APP_URL ??= "http://localhost:3002";

const { paymentsFor, paymentsHint } = await import("@/server/payments");
const { clampFee, platformFeeCents } = await import("@/server/connect");

const ws = (plan: string, extra: Record<string, unknown> = {}) =>
  ({ name: "Acme", plan, settings: {}, stripeAccountId: null, ...extra }) as never;

describe("paymentsFor", () => {
  it("is off everywhere without the platform key", () => {
    delete process.env.STRIPE_SECRET_KEY;
    process.env.TENANCY = "single";
    expect(paymentsFor(ws("self-hosted"))).toEqual({ ok: false, reason: "unconfigured" });
  });
  it("charges the install's own account when self-hosted", () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    process.env.TENANCY = "single";
    expect(paymentsFor(ws("self-hosted"))).toEqual({ ok: true, account: null });
  });
  it("in cloud mode needs a connected account and Stripe's go-ahead, in that order", () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    process.env.TENANCY = "multi";
    // Every plan can take payments (Free pays the platform fee); a connected account comes first.
    expect(paymentsFor(ws("free"))).toEqual({ ok: false, reason: "not_connected" });
    expect(paymentsFor(ws("pro"))).toEqual({ ok: false, reason: "not_connected" });
    expect(paymentsFor(ws("pro", { stripeAccountId: "acct_1" }))).toEqual({
      ok: false,
      reason: "pending",
    });
    const ready = ws("pro", {
      stripeAccountId: "acct_1",
      settings: { payments: { chargesEnabled: true } },
    });
    expect(paymentsFor(ready)).toEqual({ ok: true, account: "acct_1" });
    expect(paymentsHint(ready)).toBe("");
    expect(paymentsHint(ws("pro"))).toMatch(/Connect your Stripe account/);
  });
  it("never routes a cloud host's money to the platform account", () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    process.env.TENANCY = "multi";
    for (const plan of ["free", "pro", "team"]) {
      const r = paymentsFor(ws(plan));
      expect(r.ok).toBe(false);
    }
  });
});

describe("platform fee", () => {
  it("rounds to the cent and never exceeds the amount", () => {
    expect(platformFeeCents(8000, 2.5)).toBe(200);
    expect(platformFeeCents(999, 1)).toBe(10);
    expect(platformFeeCents(100, 0)).toBe(0);
    expect(platformFeeCents(0, 10)).toBe(0);
    expect(platformFeeCents(50, 200)).toBe(50);
  });
  it("keeps the configured percentage within 0 to 50", () => {
    expect(clampFee(-3)).toBe(0);
    expect(clampFee(75)).toBe(50);
    expect(clampFee(2.456)).toBe(2.46);
  });
});
