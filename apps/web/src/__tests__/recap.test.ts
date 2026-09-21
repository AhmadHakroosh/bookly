import { describe, expect, it } from "vitest";
import { parseRecap } from "@/server/recap-text";

describe("recap parsing", () => {
  it("accepts a full recap with evidence and fills defaults", () => {
    const r = parseRecap(
      JSON.stringify({
        summary: "Good call.",
        actions: [
          { title: "Send proposal", owner: "me", dueInDays: 2, t: 61, quote: "by Wednesday" },
          { title: "Share docs", owner: "them" },
        ],
        objections: [{ text: "Price feels high", t: 120 }],
        covered: [{ asked: "MVP scope", covered: true }],
        suggestedStage: "active",
        temperature: "warm",
      }),
    );
    expect(r?.actions[1]).toEqual({
      title: "Share docs",
      owner: "them",
      dueInDays: null,
      t: null,
      quote: null,
    });
    expect(r?.objections[0]?.quote).toBeNull();
    expect(r?.decisions).toEqual([]);
    expect(r?.followUp).toBeNull();
    expect(parseRecap("nope")).toBeNull();
  });
});
