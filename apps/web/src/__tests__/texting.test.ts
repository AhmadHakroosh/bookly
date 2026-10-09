import { afterEach, describe, expect, it, vi } from "vitest";

process.env.AUTH_SECRET ??= "test-secret-test-secret-test";
process.env.DATABASE_URL ??= "postgres://x:y@localhost:5432/z";
process.env.APP_URL ??= "http://localhost:3002";

const fresh = async (env: Record<string, string | undefined>) => {
  for (const k of [
    "TEXT_PROVIDER",
    "SENTDM_API_KEY",
    "SENTDM_SANDBOX",
    "TWILIO_ACCOUNT_SID",
    "TWILIO_AUTH_TOKEN",
    "TWILIO_FROM_SMS",
    "TWILIO_FROM_WHATSAPP",
    "WHATSAPP_ACCESS_TOKEN",
    "WHATSAPP_PHONE_NUMBER_ID",
    "WHATSAPP_TEMPLATE_LANGUAGE",
  ])
    delete process.env[k];
  Object.assign(process.env, env);
  vi.resetModules();
  return import("@/server/texting");
};

afterEach(() => vi.restoreAllMocks());

describe("text provider selection", () => {
  it("prefers Sent.dm when its key is set and nothing is forced", async () => {
    const t = await fresh({
      SENTDM_API_KEY: "k",
      TWILIO_ACCOUNT_SID: "AC",
      TWILIO_AUTH_TOKEN: "t",
      TWILIO_FROM_SMS: "+15550001111",
    });
    expect(t.textProvider().name).toBe("sentdm");
    expect(t.textProvider().channelAvailable("whatsapp")).toBe(true);
  });
  it("uses Twilio when only Twilio is configured, and honours TEXT_PROVIDER", async () => {
    const t = await fresh({
      TWILIO_ACCOUNT_SID: "AC",
      TWILIO_AUTH_TOKEN: "t",
      TWILIO_FROM_SMS: "+15550001111",
    });
    expect(t.textProvider().name).toBe("twilio");
    expect(t.textProvider().channelAvailable("sms")).toBe(true);
    expect(t.textProvider().channelAvailable("whatsapp")).toBe(false);
    const forced = await fresh({ TEXT_PROVIDER: "twilio", SENTDM_API_KEY: "k" });
    expect(forced.textProvider().name).toBe("twilio");
    expect(forced.textProvider().configured()).toBe(false);
  });
  it("reports nothing configured when no provider has keys", async () => {
    const t = await fresh({});
    expect(t.textProvider().configured()).toBe(false);
    expect(await t.textProvider().send("sms", "+15550002222", "hi")).toBe(false);
  });
});

describe("Sent.dm driver", () => {
  it("posts the recipient, ordered channel, text and the api key header", async () => {
    const t = await fresh({ SENTDM_API_KEY: "secret-key" });
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 202 }));
    expect(await t.sentdm.send("whatsapp", "+972501234567", "Your call is in an hour")).toBe(true);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.sent.dm/v3/messages");
    expect((init!.headers as Record<string, string>)["x-api-key"]).toBe("secret-key");
    expect(JSON.parse(init!.body as string)).toEqual({
      to: ["+972501234567"],
      channel: ["whatsapp"],
      text: "Your call is in an hour",
    });
  });
  it("adds the sandbox flag when SENTDM_SANDBOX is on and refuses non-E.164 numbers", async () => {
    const t = await fresh({ SENTDM_API_KEY: "k", SENTDM_SANDBOX: "true" });
    expect(t.sentdmBody("sms", "+15550002222", "x")).toMatchObject({ sandbox: true });
    const fetchMock = vi.spyOn(globalThis, "fetch");
    expect(await t.sentdm.send("sms", "0501234567", "x")).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("returns false on a provider error without throwing", async () => {
    const t = await fresh({ SENTDM_API_KEY: "k" });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("nope", { status: 401 }));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await t.sentdm.send("sms", "+15550002222", "x")).toBe(false);
  });
});

describe("Meta (WhatsApp Cloud API) driver", () => {
  const metaEnv = {
    WHATSAPP_ACCESS_TOKEN: "EAAtoken",
    WHATSAPP_PHONE_NUMBER_ID: "1379950755197872",
  };

  it("serves WhatsApp only, and is picked for WhatsApp ahead of Sent.dm while Sent.dm keeps SMS", async () => {
    const t = await fresh({ ...metaEnv, SENTDM_API_KEY: "k" });
    expect(t.meta.channelAvailable("whatsapp")).toBe(true);
    expect(t.meta.channelAvailable("sms")).toBe(false);
    expect(t.providerFor("whatsapp")?.name).toBe("meta");
    expect(t.providerFor("sms")?.name).toBe("sentdm");
    expect(t.textProviders().map((p) => p.name)).toEqual(["meta", "sentdm"]);
    const alone = await fresh(metaEnv);
    expect(alone.providerFor("sms")).toBeNull();
    expect(await alone.textProvider().send("sms", "+15550002222", "hi")).toBe(false);
  });

  it("sends a booking template with the four body parameters and the manage token on the button", async () => {
    const t = await fresh(metaEnv);
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response('{"messages":[{"id":"wamid.1"}]}', { status: 200 }));
    const ok = await t.meta.send("whatsapp", "+972501234567", "plain fallback", {
      kind: "booking_reminder",
      attendeeName: "Dana",
      eventTitle: "Intro call",
      hostName: "Ahmad Hakroosh",
      when: "in 1 hour (Tue 14 Oct, 10:00)",
      token: "tok_abc123",
    });
    expect(ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://graph.facebook.com/v22.0/1379950755197872/messages");
    expect((init!.headers as Record<string, string>).authorization).toBe("Bearer EAAtoken");
    expect(JSON.parse(init!.body as string)).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "972501234567",
      type: "template",
      template: {
        name: "booking_reminder",
        language: { code: "en" },
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: "Dana" },
              { type: "text", text: "Intro call" },
              { type: "text", text: "Ahmad Hakroosh" },
              { type: "text", text: "in 1 hour (Tue 14 Oct, 10:00)" },
            ],
          },
          {
            type: "button",
            sub_type: "url",
            index: "0",
            parameters: [{ type: "text", text: "tok_abc123" }],
          },
        ],
      },
    });
  });

  it("maps host pings, verification codes and plain text; flattens whitespace in parameters", async () => {
    const t = await fresh({ ...metaEnv, WHATSAPP_TEMPLATE_LANGUAGE: "en_US" });
    const ping = t.metaPayload("+15550002222", "x", {
      kind: "host_ping",
      text: "3 tasks are overdue:\n\n• one\n• two",
    }) as { template: { name: string; language: { code: string }; components: unknown[] } };
    expect(ping.template.name).toBe("host_ping");
    expect(ping.template.language.code).toBe("en_US");
    expect(ping.template.components).toEqual([
      { type: "body", parameters: [{ type: "text", text: "3 tasks are overdue: • one • two" }] },
      {
        type: "button",
        sub_type: "url",
        index: "0",
        parameters: [{ type: "text", text: "admin" }],
      },
    ]);
    const withBooking = t.metaPayload("+15550002222", "x", {
      kind: "host_ping",
      text: "Dana booked",
      bookingId: "b1",
    }) as { template: { components: { parameters: { text: string }[] }[] } };
    expect(withBooking.template.components[1]!.parameters[0]!.text).toBe("b1");
    const code = t.metaPayload("+15550002222", "x", {
      kind: "verification_code",
      code: "123456",
    }) as {
      template: { name: string; components: { parameters: { text: string }[] }[] };
    };
    expect(code.template.name).toBe("phone_verification");
    expect(code.template.components.map((c) => c.parameters[0]!.text)).toEqual([
      "123456",
      "123456",
    ]);
    expect(t.metaPayload("+15550002222", "free text")).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "15550002222",
      type: "text",
      text: { preview_url: false, body: "free text" },
    });
  });

  it("returns false on a Meta error without throwing and refuses non-E.164 numbers", async () => {
    const t = await fresh(metaEnv);
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response('{"error":{"code":131026}}', { status: 400 }));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(
      await t.meta.send("whatsapp", "+15550002222", "x", { kind: "verification_code", code: "1" }),
    ).toBe(false);
    expect(await t.meta.send("whatsapp", "0501234567", "x")).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("verifies Meta's webhook signature", async () => {
    const t = await fresh({});
    const { createHmac } = await import("node:crypto");
    const body = '{"object":"whatsapp_business_account"}';
    const sig = `sha256=${createHmac("sha256", "app-secret").update(body).digest("hex")}`;
    expect(t.verifyMetaSignature("app-secret", body, sig)).toBe(true);
    expect(t.verifyMetaSignature("app-secret", body + " ", sig)).toBe(false);
    expect(t.verifyMetaSignature("other", body, sig)).toBe(false);
    expect(t.verifyMetaSignature("app-secret", body, null)).toBe(false);
    expect(t.verifyMetaSignature("app-secret", body, "sha256=zz")).toBe(false);
  });
});
