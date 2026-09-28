import { describe, expect, it, vi } from "vitest";

process.env.AUTH_SECRET ??= "test-secret-test-secret-test";
process.env.DATABASE_URL ??= "postgres://x:y@localhost:5432/z";
process.env.APP_URL ??= "http://localhost:3002";
process.env.TENANCY = "multi";
const { guestCustomer } = await import("@/server/payments");

const fake = (data: { id: string; name?: string | null; metadata?: Record<string, string> }[]) => {
  const client = {
    customers: {
      list: vi.fn(async () => ({ data })),
      create: vi.fn(async () => ({ id: "cus_new" })),
      update: vi.fn(async () => ({ id: "cus_upd" })),
    },
  };
  return client as unknown as Parameters<typeof guestCustomer>[0] & typeof client;
};

describe("guestCustomer", () => {
  it("creates a guest-tagged customer named as the guest booked", async () => {
    const c = fake([]);
    expect(await guestCustomer(c, "Ada Lovelace", "ada@example.com")).toBe("cus_new");
    expect(c.customers.list).toHaveBeenCalledWith({ email: "ada@example.com", limit: 10 });
    expect(c.customers.create).toHaveBeenCalledWith({
      email: "ada@example.com",
      name: "Ada Lovelace",
      metadata: { kind: "guest" },
    });
  });
  it("reuses the guest customer for the email and refreshes its name", async () => {
    const c = fake([
      { id: "cus_ws", name: "Acme", metadata: { workspaceId: "w1" } },
      { id: "cus_g", name: "A. Lovelace", metadata: { kind: "guest" } },
    ]);
    expect(await guestCustomer(c, "Ada Lovelace", "ada@example.com")).toBe("cus_g");
    expect(c.customers.create).not.toHaveBeenCalled();
    expect(c.customers.update).toHaveBeenCalledWith("cus_g", { name: "Ada Lovelace" });
  });
  it("never borrows a workspace's billing customer that shares the email", async () => {
    const c = fake([{ id: "cus_ws", name: "Acme", metadata: { workspaceId: "w1" } }]);
    expect(await guestCustomer(c, "Ada", "ada@example.com")).toBe("cus_new");
    expect(c.customers.update).not.toHaveBeenCalled();
  });
});
