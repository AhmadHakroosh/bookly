import { describe, expect, it } from "vitest";
import { factsForModel, plainBrief, type BriefFacts } from "@/server/brief-text";

const now = new Date("2026-09-21T10:00:00Z");
const facts: BriefFacts = {
  tz: "UTC",
  booking: {
    startAt: new Date("2026-09-22T09:00:00Z"),
    endAt: new Date("2026-09-22T09:30:00Z"),
    timezone: "UTC",
    notes: "Bring the API docs",
    answers: {},
    seriesIndex: null,
    seriesCount: null,
  },
  eventTitle: "Intro call",
  questions: [{ label: "What would you like to discuss?", answer: "An MVP for a marketplace" }],
  contact: {
    name: "Ahmad",
    email: "a@x.io",
    company: "Acme",
    stage: "lead",
    tags: ["vip"],
    notes: "Budget around 30k",
    bookingsCount: 2,
    createdAt: new Date("2026-06-01T00:00:00Z"),
  },
  timeline: [
    {
      type: "no_show",
      summary: "Did not show up",
      createdAt: new Date("2026-08-01T00:00:00Z"),
      data: {},
    },
    {
      type: "note",
      summary: "Sent the proposal",
      createdAt: new Date("2026-07-01T00:00:00Z"),
      data: {},
    },
  ],
  previousMeetings: [
    { title: "Discovery", startAt: new Date("2026-06-20T09:00:00Z"), status: "completed" },
  ],
};

describe("plain brief", () => {
  it("summarises who, history, answers, notes and warnings", () => {
    const b = plainBrief(facts, now);
    expect(b).toContain("Ahmad, Acme · lead · vip");
    expect(b).toContain('1 previous meeting; last one "Discovery" 93 days ago (completed)');
    expect(b).toContain("An MVP for a marketplace");
    expect(b).toContain("Their note: Bring the API docs");
    expect(b).toContain("Your notes: Budget around 30k");
    expect(b).toContain("Recent notes: Sent the proposal");
    expect(b).toContain("Heads-up: 1 no-show before");
  });
  it("says so when it is a first conversation", () => {
    const b = plainBrief({ ...facts, previousMeetings: [], timeline: [] }, now);
    expect(b).toContain("First meeting.");
    expect(b).not.toContain("Heads-up");
  });
  it("gives the model the same facts in readable form", () => {
    const t = factsForModel(facts, now);
    expect(t).toContain("Meeting: Intro call");
    expect(t).toContain("[no_show] Did not show up");
    expect(t).toContain("Previous meetings:");
  });
});
