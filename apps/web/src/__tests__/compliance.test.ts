import { describe, expect, it } from "vitest";

process.env.AUTH_SECRET ??= "test-secret-test-secret-test";
process.env.DATABASE_URL ??= "postgres://x:y@localhost:5432/z";
process.env.APP_URL ??= "http://localhost:3002";

const { scrubPii, scrubDeep } = await import("@/lib/scrub");
const { unsubscribeToken, readUnsubscribeToken, unsubscribeUrl, unsubscribePostUrl } =
  await import("@/server/unsubscribe");
const { captureEnabled } = await import("@/server/transcripts");
const { letterMail } = await import("@/emails/booking");

describe("error-report scrubbing", () => {
  it("replaces emails and phone numbers wherever they appear", () => {
    expect(scrubPii("mail sam.lee+x@example.co.uk or call +1 (415) 555-0134 now")).toBe(
      "mail [email] or call [phone] now",
    );
    const event = scrubDeep({
      message: "failed for sam@example.com",
      request: { url: "https://x/?email=sam@example.com", headers: { ua: "safe" } },
      breadcrumbs: [{ data: { phone: "+44 20 7946 0958" } }],
      n: 3,
    });
    expect(event.message).toBe("failed for [email]");
    expect(event.request.url).toBe("https://x/?email=[email]");
    expect(event.breadcrumbs[0]!.data.phone).toBe("[phone]");
    expect(event.n).toBe(3);
  });
  it("leaves short numbers, dates and ids alone", () => {
    expect(scrubPii("booking 2026-10-01 seat 12 id 4f3a")).toBe(
      "booking 2026-10-01 seat 12 id 4f3a",
    );
  });
});

describe("unsubscribe tokens", () => {
  it("round-trips and rejects a tampered signature", () => {
    const t = unsubscribeToken("c_123");
    expect(readUnsubscribeToken(t)).toBe("c_123");
    expect(readUnsubscribeToken(t.slice(0, -2) + "zz")).toBeNull();
    expect(readUnsubscribeToken("c_999." + t.split(".")[1])).toBeNull();
    expect(readUnsubscribeToken("garbage")).toBeNull();
    expect(unsubscribeUrl("c_123")).toBe(`http://localhost:3002/unsubscribe/${t}`);
    expect(unsubscribePostUrl("c_123")).toBe(`http://localhost:3002/api/unsubscribe/${t}`);
  });
});

describe("recording consent", () => {
  it("captures when the attendee agreed or the event type is always on, never otherwise", () => {
    const daily = { meetingProvider: "daily" } as const;
    expect(captureEnabled({ ...daily, captureConsent: true }, { autoCapture: "ask" })).toBe(true);
    expect(captureEnabled({ ...daily, captureConsent: null }, { autoCapture: "ask" })).toBe(false);
    expect(captureEnabled({ ...daily, captureConsent: null }, { autoCapture: "always" })).toBe(
      true,
    );
    expect(captureEnabled({ ...daily, captureConsent: true }, { autoCapture: "off" })).toBe(false);
    expect(
      captureEnabled({ meetingProvider: "phone", captureConsent: true }, { autoCapture: "always" }),
    ).toBe(false);
  });
});

describe("outreach email footer", () => {
  it("carries the postal address and the unsubscribe link", async () => {
    const mail = await letterMail({
      brand: {
        name: "Acme",
        logoUrl: "https://b.example/logo.png",
        accent: "#336699",
        baseUrl: "https://b.example",
        poweredBy: false,
      },
      subject: "Hello",
      body: "Hi there",
      signedBy: "Ahmad",
      address: "Acme Ltd, 1 Example Street, London",
      unsubscribeUrl: "https://b.example/unsubscribe/abc",
    });
    const html = mail.html.replace(/<!--.*?-->/g, "");
    expect(html).toContain("Acme Ltd, 1 Example Street, London");
    expect(html).toContain('href="https://b.example/unsubscribe/abc"');
    expect(html).toContain("Unsubscribe");
    expect(mail.text).toContain("https://b.example/unsubscribe/abc");
  });
});
