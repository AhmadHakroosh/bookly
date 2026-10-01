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
