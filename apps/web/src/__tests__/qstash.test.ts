import { describe, expect, it, vi } from "vitest";
import { publish, signForTests, upsertSchedule, verifyQstashSignature } from "@bookly/jobs";

describe("verifyQstashSignature", () => {
  const body = JSON.stringify({ bookingId: "b1" });
  it("accepts a signature from the current or next key and checks the body hash", () => {
    const cur = signForTests(body, "current-key");
    const nxt = signForTests(body, "next-key");
    const keys = { current: "current-key", next: "next-key" };
    expect(verifyQstashSignature(cur, body, keys).ok).toBe(true);
    expect(verifyQstashSignature(nxt, body, keys).ok).toBe(true);
    expect(verifyQstashSignature(cur, body + " ", keys)).toMatchObject({
      ok: false,
      reason: "body hash mismatch",
    });
    expect(verifyQstashSignature(signForTests(body, "other"), body, keys)).toMatchObject({
      ok: false,
      reason: "bad signature",
    });
    expect(verifyQstashSignature(null, body, keys)).toMatchObject({ ok: false });
  });
  it("rejects expired tokens", () => {
    const old = signForTests(body, "k", { exp: Math.floor(Date.now() / 1000) - 10 });
    expect(verifyQstashSignature(old, body, { current: "k" })).toMatchObject({
      ok: false,
      reason: "expired",
    });
  });
});

describe("publish / upsertSchedule", () => {
  it("sends delay, dedupe and cron as Upstash headers", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init! });
      return new Response(JSON.stringify({ messageId: "m1" }), { status: 200 });
    });
    const cfg = {
      url: "https://qstash.example/",
      token: "t",
      fetchImpl: fetchImpl as typeof fetch,
    };
    await publish(
      cfg,
      "https://app.example/api/jobs/booking.remind",
      { bookingId: "b1" },
      { delaySeconds: 90.2, dedupeId: "remind:b1" },
    );
    const h = calls[0]!.init.headers as Record<string, string>;
    expect(calls[0]!.url).toBe(
      "https://qstash.example/v2/publish/https://app.example/api/jobs/booking.remind",
    );
    expect(h["upstash-delay"]).toBe("91s");
    expect(h["upstash-deduplication-id"]).toBe("remind-b1");
    expect(h.authorization).toBe("Bearer t");
    await upsertSchedule(cfg, {
      scheduleId: "bookly-x",
      cron: "*/5 * * * *",
      destination: "https://app.example/api/jobs/x",
    });
    const h2 = calls[1]!.init.headers as Record<string, string>;
    expect(calls[1]!.url).toBe(
      "https://qstash.example/v2/schedules/https://app.example/api/jobs/x",
    );
    expect(h2["upstash-cron"]).toBe("*/5 * * * *");
    expect(h2["upstash-schedule-id"]).toBe("bookly-x");
  });
});
