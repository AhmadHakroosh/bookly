import { describe, expect, it } from "vitest";

process.env.AUTH_SECRET ??= "test-secret-test-secret-test";
process.env.DATABASE_URL ??= "postgres://x:y@localhost:5432/z";
process.env.APP_URL ??= "http://localhost:3002";
process.env.TENANCY = "multi";
const { invoiceCreation } = await import("@/server/payments");

const ws = (over: Record<string, unknown>) =>
  ({
    id: "w1",
    name: "Acme",
    plan: "pro",
    planStatus: "active",
    planManagedBy: "stripe",
    settings: { payments: { invoices: true }, postalAddress: "1 Main St" },
    ...over,
  }) as never;

describe("invoiceCreation", () => {
  it("issues the invoice from the host's account when turned on and allowed by the plan", () => {
    const r = invoiceCreation(ws({}), "acct_1", "Intro call (30 min) with Acme") as {
      invoice_creation: {
        enabled: boolean;
        invoice_data: { issuer: { account: string }; footer?: string };
      };
    };
    expect(r.invoice_creation.enabled).toBe(true);
    expect(r.invoice_creation.invoice_data.issuer.account).toBe("acct_1");
    expect(r.invoice_creation.invoice_data.footer).toContain("1 Main St");
  });
  it("adds nothing without a connected account, when off, or on Free", () => {
    expect(invoiceCreation(ws({}), null, "x")).toEqual({});
    expect(
      invoiceCreation(ws({ settings: { payments: { invoices: false } } }), "acct_1", "x"),
    ).toEqual({});
    expect(invoiceCreation(ws({ plan: "free" }), "acct_1", "x")).toEqual({});
  });
});
