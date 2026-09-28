import { describe, expect, it } from "vitest";

process.env.AUTH_SECRET ??= "test-secret-test-secret-test";
process.env.DATABASE_URL ??= "postgres://x:y@localhost:5432/z";
process.env.APP_URL ??= "http://localhost:3002";
const { codeMatches } = await import("@/server/phone-verification");
const { createHash } = await import("node:crypto");

const hash = (code: string) =>
  createHash("sha256").update(`${process.env.AUTH_SECRET}:${code}`).digest("hex");
const pending = (over: Partial<ReturnType<typeof base>> = {}) => ({ ...base(), ...over });
const base = () => ({
  phone: "+972501234567",
  hash: hash("123456"),
  expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
  sentAt: new Date().toISOString(),
  attempts: 0,
});

describe("phone verification codes", () => {
  it("accepts the right code for the same number while it is fresh", () => {
    expect(codeMatches(pending(), "+972501234567", " 123456 ").ok).toBe(true);
  });
  it("rejects a wrong, expired, exhausted or re-targeted code with a reason", () => {
    expect(codeMatches(pending(), "+972501234567", "000000")).toEqual({
      ok: false,
      reason: "wrong",
    });
    expect(
      codeMatches(
        pending({ expiresAt: new Date(Date.now() - 1000).toISOString() }),
        "+972501234567",
        "123456",
      ),
    ).toEqual({ ok: false, reason: "expired" });
    expect(codeMatches(pending({ attempts: 5 }), "+972501234567", "123456")).toEqual({
      ok: false,
      reason: "attempts",
    });
    expect(codeMatches(pending(), "+972500000000", "123456")).toEqual({
      ok: false,
      reason: "phone",
    });
    expect(codeMatches(null, "+972501234567", "123456")).toEqual({ ok: false, reason: "none" });
  });
});
