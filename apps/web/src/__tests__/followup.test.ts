import { describe, expect, it } from "vitest";

process.env.AUTH_SECRET ??= "test-secret-test-secret-test";
process.env.DATABASE_URL ??= "postgres://x:y@localhost:5432/z";
process.env.APP_URL ??= "http://localhost:3002";

const { followUpMail } = await import("@/emails/booking");

const brand = {
  name: "W",
  logoUrl: "https://b.example/logo-mark.png",
  accent: "#e8965a",
  baseUrl: "https://b.example",
  poweredBy: true,
};

describe("followUpMail", () => {
  it("fills placeholders from the template and renders a branded letter", async () => {
    const m = await followUpMail({
      booking: {
        attendeeName: "Sam Lee",
        manageToken: "tok",
        startAt: new Date("2026-10-01T09:00:00Z"),
        endAt: new Date("2026-10-01T09:30:00Z"),
        timezone: "UTC",
        location: { type: "daily" },
        meetingUrl: null,
      } as never,
      eventType: {
        title: "Intro call",
        followUp: { subject: "Thanks {name}", body: "{host} here about {event}: {bookingUrl}" },
      } as never,
      host: { displayName: "Ahmad", timezone: "UTC" } as never,
      workspaceName: "W",
      baseUrl: "https://b.example",
      brand,
    });
    expect(m.subject).toBe("Thanks Sam");
    expect(m.text).toContain("Ahmad here about Intro call: https://b.example/booking/tok");
    expect(m.html.replace(/<!-- -->/g, "")).toContain("Sent by Ahmad via W");
    expect(m.html).toContain('src="https://b.example/logo-mark.png"');
  });
});
