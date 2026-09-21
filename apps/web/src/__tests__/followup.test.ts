import { describe, expect, it } from "vitest";

process.env.AUTH_SECRET ??= "test-secret-test-secret-test";
process.env.DATABASE_URL ??= "postgres://x:y@localhost:5432/z";
process.env.APP_URL ??= "http://localhost:3002";

const { followUpMail } = await import("@/emails/booking");

describe("followUpMail", () => {
  it("fills placeholders from the template", () => {
    const m = followUpMail({
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
    });
    expect(m.subject).toBe("Thanks Sam");
    expect(m.text).toBe("Ahmad here about Intro call: https://b.example/booking/tok");
  });
});
