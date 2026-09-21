import { describe, expect, it } from "vitest";
import { dueDate, manualCapture, parseCapture } from "@/server/capture-text";

describe("capture parsing", () => {
  it("accepts fenced or prose-wrapped JSON and applies defaults", () => {
    const c = parseCapture(
      'Here you go:\n```json\n{"summary":"We agreed on discovery.","actions":[{"title":"Send proposal","dueInDays":3}],"suggestedStage":"active"}\n```',
    );
    expect(c?.summary).toBe("We agreed on discovery.");
    expect(c?.actions[0]).toEqual({ title: "Send proposal", dueInDays: 3, owner: "me" });
    expect(c?.decisions).toEqual([]);
    expect(c?.followUp).toBeNull();
    expect(parseCapture("not json at all")).toBeNull();
    expect(parseCapture('{"actions":[{"title":""}]}')).toBeNull();
  });

  it("falls back to manual capture: bullet lines become tasks", () => {
    const c = manualCapture(
      "Good call.\n- Send proposal by Friday\n* They share API docs\nno bullet",
    );
    expect(c.actions.map((a) => a.title)).toEqual([
      "Send proposal by Friday",
      "They share API docs",
    ]);
    expect(c.summary).toContain("Good call.");
  });

  it("computes due dates from days", () => {
    const now = new Date("2026-09-21T00:00:00Z");
    expect(dueDate(3, now)?.toISOString()).toBe("2026-09-24T00:00:00.000Z");
    expect(dueDate(null, now)).toBeNull();
  });
});
