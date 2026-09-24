import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

process.env.AUTH_SECRET ??= "test-secret-test-secret-test";
process.env.DATABASE_URL ??= "postgres://x:y@localhost:5432/z";
process.env.APP_URL ??= "http://localhost:3002";

const { verifyZoomSignature, zoomChallenge } = await import("@/server/integrations/zoom");

describe("zoom event notifications", () => {
  const secret = "shhh";
  it("verifies the v0 signature over timestamp and body, within five minutes", () => {
    const body = JSON.stringify({ event: "app_deauthorized" });
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = `v0=${createHmac("sha256", secret).update(`v0:${ts}:${body}`).digest("hex")}`;
    expect(verifyZoomSignature(secret, { timestamp: ts, signature: sig }, body)).toBe(true);
    expect(verifyZoomSignature(secret, { timestamp: ts, signature: sig }, body + " ")).toBe(false);
    expect(verifyZoomSignature("other", { timestamp: ts, signature: sig }, body)).toBe(false);
    const old = String(Math.floor(Date.now() / 1000) - 600);
    const oldSig = `v0=${createHmac("sha256", secret).update(`v0:${old}:${body}`).digest("hex")}`;
    expect(verifyZoomSignature(secret, { timestamp: old, signature: oldSig }, body)).toBe(false);
    expect(verifyZoomSignature(secret, { timestamp: null, signature: sig }, body)).toBe(false);
  });
  it("answers the URL validation challenge with the token's HMAC", () => {
    const r = zoomChallenge(secret, "abc");
    expect(r.plainToken).toBe("abc");
    expect(r.encryptedToken).toBe(createHmac("sha256", secret).update("abc").digest("hex"));
  });
});
