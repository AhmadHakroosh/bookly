import { describe, expect, it } from "vitest";

process.env.AUTH_SECRET ??= "test-secret-test-secret-test";
process.env.DATABASE_URL ??= "postgres://x:y@localhost:5432/z";
process.env.APP_URL ??= "http://localhost:3002";

const { DEFAULT_EMAIL_TEMPLATES, fillEmailTemplate, resolveEmailTemplate } =
  await import("@/emails/defaults");
const { attendeeConfirmation, reminderMail, cancellationMail } = await import("@/emails/booking");

const brand = {
  name: "Acme",
  logoUrl: "https://b.example/logo.png",
  accent: "#336699",
  baseUrl: "https://b.example",
  poweredBy: false,
};
const ctx = (templates?: Record<string, { subject?: string; body?: string }>) => ({
  booking: {
    attendeeName: "Sam Lee",
    attendeeEmail: "sam@example.com",
    guests: [],
    manageToken: "tok",
    startAt: new Date("2026-10-01T09:00:00Z"),
    endAt: new Date("2026-10-01T09:30:00Z"),
    timezone: "UTC",
    status: "confirmed",
    location: { type: "daily" },
    meetingUrl: "https://meet.example/room",
    answers: {},
    notes: null,
    cancelledBy: "attendee",
    cancelReason: null,
  } as never,
  eventType: { title: "Intro call", autoCapture: "off", followUp: {} } as never,
  host: { displayName: "Ahmad", timezone: "UTC", username: "ahmad" } as never,
  workspaceName: "Acme",
  baseUrl: "https://b.example",
  brand,
  templates,
});

describe("email templates", () => {
  it("falls back per field and fills placeholders", () => {
    const t = resolveEmailTemplate("confirmation", {
      confirmation: { subject: "See you, {name}!" },
    });
    expect(t.subject).toBe("See you, {name}!");
    expect(t.body).toBe(DEFAULT_EMAIL_TEMPLATES.confirmation.body);
    expect(fillEmailTemplate(t, { name: "Sam", host: "Ahmad" }).subject).toBe("See you, Sam!");
  });

  it("renders the confirmation with the workspace's wording, brand and details", async () => {
    const m = await attendeeConfirmation(
      ctx({
        confirmation: {
          subject: "Locked in: {event}",
          body: "Hey {name}, {host} will see you {when}.",
        },
      }),
    );
    expect(m.subject).toBe("Locked in: Intro call");
    expect(m.text).toContain("Hey Sam, Ahmad will see you");
    expect(m.text).toContain("https://b.example/booking/tok");
    expect(m.html).toContain("Acme");
    expect(m.html).toContain("#336699");
    expect(m.html).toContain("https://meet.example/room");
    expect(m.html).not.toContain("Powered by");
  });

  it("uses defaults when nothing is customised, for reminders and cancellations too", async () => {
    const r = await reminderMail(ctx(), false, 1);
    expect(r.subject).toBe("Reminder: Intro call with Ahmad in 1 hour");
    expect(r.html).toContain("Join the call");
    const c = await cancellationMail(ctx(), false);
    expect(c.subject).toMatch(/^Cancelled: Intro call on /);
    expect(c.html).toContain("Book another time");
  });
});
