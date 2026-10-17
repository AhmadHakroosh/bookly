import { describe, expect, it } from "vitest";
import {
  clock,
  cleanEntries,
  notesForRecap,
  notesForTimeline,
  offsetOf,
} from "@/server/notes-text";
import { parseRecap } from "@/server/recap-text";

describe("in-meeting notes", () => {
  it("keeps only well-formed entries, trimmed and in time order", () => {
    const out = cleanEntries([
      { id: "b", at: "2026-10-17T10:12:00Z", text: "  Pricing question  " },
      { id: "a", at: "2026-10-17T10:04:00Z", text: "Budget approved" },
      { id: "m", at: "2026-10-17T10:15:00Z", text: "", moment: true },
      { id: "e", at: "2026-10-17T10:16:00Z", text: "   " },
      { id: "x", at: "not a date", text: "dropped" },
      { at: "2026-10-17T10:17:00Z", text: "no id" },
      "junk",
    ]);
    expect(out.map((e) => e.id)).toEqual(["a", "b", "m"]);
    expect(out[1]!.text).toBe("Pricing question");
    expect(out[2]).toMatchObject({ moment: true, text: "" });
    expect(cleanEntries("nope")).toEqual([]);
    expect(
      cleanEntries([{ id: "l", at: "2026-10-17T10:00:00Z", text: "x".repeat(5000) }])[0]!.text,
    ).toHaveLength(2000);
  });

  it("stamps notes on the transcript's clock", () => {
    const start = new Date("2026-10-17T10:00:00Z");
    expect(offsetOf("2026-10-17T10:12:30Z", start)).toBe(750);
    expect(offsetOf("2026-10-17T09:59:00Z", start)).toBe(0);
    expect(offsetOf("2026-10-17T10:12:30Z", null)).toBeNull();
    expect(clock(75)).toBe("01:15");
    expect(clock(3725)).toBe("1:02:05");
  });

  it("writes notes for the recap, with authors only when several people took notes", () => {
    const start = new Date("2026-10-17T10:00:00Z");
    const ann = {
      name: "Ann",
      entries: [
        { id: "1", at: "2026-10-17T10:12:30Z", text: "Send the proposal by Friday" },
        { id: "2", at: "2026-10-17T10:20:00Z", text: "", moment: true },
      ],
    };
    expect(notesForRecap([ann], start)).toBe(
      "[12:30] Send the proposal by Friday\n[20:00] ⚑ Marked moment",
    );
    expect(notesForRecap([ann], null)).toBe("Send the proposal by Friday\n⚑ Marked moment");
    const bob = {
      name: "Bob",
      entries: [{ id: "3", at: "2026-10-17T10:05:00Z", text: "Asked about SSO" }],
    };
    expect(notesForRecap([ann, bob], start)).toContain("[05:00] (Bob) Asked about SSO");
  });

  it("writes notes for the timeline in the host's time of day", () => {
    const text = notesForTimeline(
      [{ id: "1", at: "2026-10-17T10:12:00Z", text: "Pricing", moment: true }],
      "Asia/Jerusalem",
    );
    expect(text).toBe("13:12  ⚑ Marked moment: Pricing");
  });

  it("reads where each action item came from, defaulting to the transcript", () => {
    const r = parseRecap(
      JSON.stringify({
        summary: "s",
        actions: [
          {
            title: "Send the proposal",
            source: "notes",
            t: 750,
            quote: "Send the proposal by Friday",
          },
          { title: "Share the deck" },
        ],
      }),
    );
    expect(r!.actions[0]!.source).toBe("notes");
    expect(r!.actions[1]!.source).toBe("transcript");
  });
});
