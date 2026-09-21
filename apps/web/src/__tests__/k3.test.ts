import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

process.env.AUTH_SECRET ??= "test-secret-test-secret-test";
process.env.DATABASE_URL ??= "postgres://x:y@localhost:5432/z";
process.env.APP_URL ??= "http://localhost:3002";
process.env.TWILIO_ACCOUNT_SID = "AC123";
process.env.TWILIO_AUTH_TOKEN = "tok";
process.env.TWILIO_FROM_SMS = "+15550001111";
process.env.TWILIO_FROM_WHATSAPP = "whatsapp:+14155238886";

const { verifyDailySignature } = await import("@/server/integrations/daily");
const { twilioParams, channelAvailable } = await import("@/server/notify");
const { formatPrice, isPaid, PAYMENT_WINDOW_MIN } = await import("@/server/payments");

describe("daily webhook signature", () => {
  it("accepts a correctly signed body and rejects tampering", () => {
    const hmac = Buffer.from("secret-key-bytes").toString("base64");
    const body = JSON.stringify({ type: "participant.joined", payload: { room: "b-abc" } });
    const ts = "1789900000";
    const sig = createHmac("sha256", Buffer.from(hmac, "base64"))
      .update(`${ts}.${body}`)
      .digest("base64");
    expect(verifyDailySignature(hmac, ts, sig, body)).toBe(true);
    expect(verifyDailySignature(hmac, ts, sig, body + " ")).toBe(false);
    expect(verifyDailySignature(hmac, "1", sig, body)).toBe(false);
  });
});

describe("twilio", () => {
  it("prefixes WhatsApp numbers on both ends and leaves SMS plain", () => {
    expect(twilioParams("whatsapp", "+972501234567", "hi")).toEqual({
      From: "whatsapp:+14155238886",
      To: "whatsapp:+972501234567",
      Body: "hi",
    });
    expect(twilioParams("sms", "+972501234567", "hi").From).toBe("+15550001111");
    expect(channelAvailable("sms")).toBe(true);
  });
});

describe("payments", () => {
  it("formats prices and detects paid event types", () => {
    expect(formatPrice(15000, "usd")).toBe("$150.00");
    expect(formatPrice(9900, "eur", "de-DE")).toMatch(/99,00/);
    expect(isPaid({ priceCents: 0 })).toBe(false);
    expect(isPaid({ priceCents: null })).toBe(false);
    expect(isPaid({ priceCents: 500 })).toBe(true);
    expect(PAYMENT_WINDOW_MIN).toBe(30);
  });
});

describe("daily webhook probe", () => {
  it("recognises the registration test body and nothing else", async () => {
    const { isProbe } = await import("@/app/api/webhooks/daily/route");
    expect(isProbe('{"test":"test"}')).toBe(true);
    expect(isProbe('{"type":"participant.joined","payload":{}}')).toBe(false);
    expect(isProbe("not json")).toBe(false);
  });
});
