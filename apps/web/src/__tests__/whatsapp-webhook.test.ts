import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

async function load(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const k of ["WHATSAPP_APP_SECRET", "WHATSAPP_VERIFY_TOKEN"]) delete process.env[k];
  Object.assign(process.env, {
    AUTH_SECRET: "test-secret-test-secret-test",
    DATABASE_URL: "postgres://x:y@localhost:5432/z",
    APP_URL: "http://localhost:3002",
    ...env,
  });
  return import("@/app/api/webhooks/whatsapp/route");
}

const payload = {
  object: "whatsapp_business_account",
  entry: [
    {
      changes: [
        {
          value: {
            statuses: [
              { id: "wamid.1", status: "delivered" },
              {
                id: "wamid.2",
                status: "failed",
                errors: [{ code: 131026, title: "Message undeliverable" }],
              },
            ],
          },
        },
        { value: { messages: [{ from: "15550002222", text: { body: "thanks" } }] } },
      ],
    },
  ],
};

describe("WhatsApp webhook", () => {
  it("answers Meta's verification challenge only with the right token", async () => {
    const r = await load({ WHATSAPP_VERIFY_TOKEN: "verify-me" });
    const ok = await r.GET(
      new Request(
        "http://x/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=4242",
      ),
    );
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe("4242");
    const bad = await r.GET(
      new Request(
        "http://x/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=1",
      ),
    );
    expect(bad.status).toBe(403);
  });
  it("summarizes statuses and inbound messages, naming failed deliveries", async () => {
    const { summarize } = await load({});
    expect(summarize(payload)).toEqual({
      statuses: 2,
      messages: 1,
      failed: ["wamid.2: 131026 Message undeliverable"],
    });
    expect(summarize({})).toEqual({ statuses: 0, messages: 0, failed: [] });
  });
  it("accepts a signed post, rejects a bad signature and a missing secret", async () => {
    const r = await load({ WHATSAPP_APP_SECRET: "app-secret" });
    const body = JSON.stringify(payload);
    const sign = (s: string) => `sha256=${createHmac("sha256", s).update(body).digest("hex")}`;
    vi.spyOn(console, "error").mockImplementation(() => {});
    const post = (sig: string) =>
      r.POST(
        new Request("http://x/api/webhooks/whatsapp", {
          method: "POST",
          headers: { "x-hub-signature-256": sig, "content-type": "application/json" },
          body,
        }),
      );
    const ok = await post(sign("app-secret"));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ ok: true, statuses: 2, messages: 1 });
    expect((await post(sign("wrong"))).status).toBe(401);
    const none = await load({});
    expect(
      (await none.POST(new Request("http://x/api/webhooks/whatsapp", { method: "POST", body })))
        .status,
    ).toBe(500);
  });
});
