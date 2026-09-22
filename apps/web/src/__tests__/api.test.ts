import { describe, expect, it } from "vitest";

process.env.AUTH_SECRET ??= "test-secret-test-secret-test";
process.env.DATABASE_URL ??= "postgres://x:y@localhost:5432/z";
process.env.APP_URL ??= "http://localhost:3002";

const { sign, verifySignature, generateWebhookSecret } = await import("@/server/webhooks");
const { generateApiKey, hashKey, rateLimit } = await import("@/server/api");

describe("webhook signatures", () => {
  it("verifies a fresh signature and rejects tampering or stale timestamps", () => {
    const secret = generateWebhookSecret();
    const body = JSON.stringify({ event: "booking.created" });
    const t = Math.floor(Date.now() / 1000);
    const header = `t=${t},v1=${sign(secret, t, body)}`;
    expect(verifySignature(secret, header, body)).toBe(true);
    expect(verifySignature(secret, header, body + " ")).toBe(false);
    expect(verifySignature("whsec_other", header, body)).toBe(false);
    const old = t - 600;
    expect(verifySignature(secret, `t=${old},v1=${sign(secret, old, body)}`, body)).toBe(false);
  });
});

describe("api keys", () => {
  it("generates prefixed keys and stores only a hash", () => {
    const k = generateApiKey();
    expect(k.raw.startsWith("bk_")).toBe(true);
    expect(k.prefix).toBe(k.raw.slice(0, 10));
    expect(k.hash).toBe(hashKey(k.raw));
    expect(k.hash).not.toContain(k.raw.slice(3, 10));
  });
  it("rate limits per bucket", async () => {
    for (let i = 0; i < 3; i++) expect((await rateLimit("t", 3)).ok).toBe(true);
    expect((await rateLimit("t", 3)).ok).toBe(false);
    expect((await rateLimit("other", 3)).ok).toBe(true);
  });
});
