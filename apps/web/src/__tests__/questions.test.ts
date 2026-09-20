import { describe, expect, it } from "vitest";
import { parseQuestions } from "@/server/questions";

describe("parseQuestions", () => {
  it("parses label, type, required flag and select options", () => {
    const qs = parseQuestions(
      "What to discuss? | textarea | required\nCompany | text\nTeam size | select | optional | 1-10, 11-50 ,51+\n\nBogus | nope | yes",
    );
    expect(qs).toHaveLength(4);
    expect(qs[0]).toMatchObject({ label: "What to discuss?", type: "textarea", required: true });
    expect(qs[1]).toMatchObject({ label: "Company", type: "text", required: false });
    expect(qs[2]).toMatchObject({ type: "select", options: ["1-10", "11-50", "51+"] });
    expect(qs[3]).toMatchObject({ type: "text", required: true });
    expect(new Set(qs.map((q) => q.id)).size).toBe(4);
  });
});
