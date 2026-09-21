import { describe, expect, it } from "vitest";
import { parseQuestionsJson, parseReminders } from "@/server/questions";

describe("parseReminders", () => {
  it("parses, dedupes, bounds and sorts descending", () => {
    expect(parseReminders("1440, 60")).toEqual([1440, 60]);
    expect(parseReminders("60 1440 60 2")).toEqual([1440, 60]);
    expect(parseReminders("")).toEqual([]);
    expect(parseReminders("999999")).toEqual([]);
  });
});

describe("parseQuestionsJson", () => {
  it("keeps valid questions, drops empty labels, normalises types", () => {
    const qs = parseQuestionsJson(
      JSON.stringify([
        { id: "q1", label: "Topic", type: "textarea", required: true },
        { label: "", type: "text" },
        { label: "Size", type: "select", options: ["1-10", " 11-50 ", ""] },
        { label: "Weird", type: "checkbox" },
      ]),
    );
    expect(qs.map((q) => q.label)).toEqual(["Topic", "Size", "Weird"]);
    expect(qs[1]!.options).toEqual(["1-10", "11-50"]);
    expect(qs[2]!.type).toBe("text");
    expect(qs[2]!.id).toMatch(/^q4_weird/);
  });
  it("returns an empty list for garbage", () => {
    expect(parseQuestionsJson("not json")).toEqual([]);
    expect(parseQuestionsJson('{"a":1}')).toEqual([]);
  });
});
