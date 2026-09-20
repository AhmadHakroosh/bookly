import { describe, expect, it } from "vitest";
import { buildIcs } from "@/server/ics";

describe("buildIcs", () => {
  it("emits a valid VCALENDAR with organizer, attendee and escaped text", () => {
    const ics = buildIcs({
      uid: "b1@bookly",
      start: new Date("2026-09-22T07:00:00Z"),
      end: new Date("2026-09-22T07:30:00Z"),
      summary: "Intro call; with Ahmad",
      description: "Line 1\nLine 2, comma",
      organizer: { name: "Ahmad", email: "ahmad@example.com" },
      attendees: [{ name: "Guest", email: "guest@example.com" }],
    });
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("DTSTART:20260922T070000Z");
    expect(ics).toContain("SUMMARY:Intro call\; with Ahmad");
    expect(ics).toContain("DESCRIPTION:Line 1\\nLine 2\\, comma");
    expect(ics).toContain("ORGANIZER;CN=Ahmad:mailto:ahmad@example.com");
    expect(ics).toContain(
      "ATTENDEE;CN=Guest;ROLE=REQ-PARTICIPANT;RSVP=TRUE:mailto:guest@example.com",
    );
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });
});
