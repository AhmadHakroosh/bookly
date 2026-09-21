import { describe, expect, it } from "vitest";
import { parseRulesJson, routeAnswers, ruleMatches } from "@/server/routing-rules";

const rules = [
  {
    id: "enterprise",
    match: "all" as const,
    conditions: [
      { questionId: "size", op: "equals" as const, value: "50+" },
      { questionId: "budget", op: "not_empty" as const, value: "" },
    ],
    destination: { type: "event_type" as const, eventTypeId: "et_big" },
  },
  {
    id: "partner",
    match: "any" as const,
    conditions: [
      { questionId: "topic", op: "contains" as const, value: "partner" },
      { questionId: "topic", op: "equals" as const, value: "Reseller" },
    ],
    destination: { type: "url" as const, url: "https://partners.example.com" },
  },
];
const fallback = { type: "message" as const, text: "Email us" };

describe("routing rules", () => {
  it("picks the first matching rule, case-insensitively", () => {
    expect(routeAnswers({ rules, fallback }, { size: "50+", budget: "yes", topic: "" })).toEqual({
      type: "event_type",
      eventTypeId: "et_big",
    });
    expect(routeAnswers({ rules, fallback }, { size: "1-10", topic: "Partnership " })).toEqual({
      type: "url",
      url: "https://partners.example.com",
    });
    expect(routeAnswers({ rules, fallback }, { size: "1-10", topic: "other" })).toEqual(fallback);
    expect(routeAnswers({ rules, fallback: null }, {})).toBeNull();
  });

  it("requires every condition for 'all' and treats no conditions as always true", () => {
    expect(ruleMatches(rules[0]!, { size: "50+" })).toBe(false);
    expect(ruleMatches({ ...rules[0]!, conditions: [] }, {})).toBe(true);
  });

  it("drops rules whose destination is unknown or malformed", () => {
    const parsed = parseRulesJson(
      JSON.stringify([
        rules[0],
        {
          id: "x",
          match: "all",
          conditions: [],
          destination: { type: "event_type", eventTypeId: "nope" },
        },
        {
          id: "y",
          match: "all",
          conditions: [],
          destination: { type: "url", url: "javascript:alert(1)" },
        },
      ]),
      new Set(["et_big"]),
    );
    expect(parsed.map((r) => r.id)).toEqual(["enterprise"]);
    expect(parseRulesJson("not json", new Set())).toEqual([]);
  });
});

describe("docs headings", () => {
  it("adds unique ids and anchors to h2/h3 and collects a table of contents", async () => {
    const { decorateHeadings, slugify } = await import("@/server/docs");
    const { html, headings } = decorateHeadings(
      "<h2>Setup &amp; run</h2><p>x</p><h3>Setup</h3><h2>Setup</h2>",
    );
    expect(headings.map((h) => h.id)).toEqual(["setup-run", "setup", "setup-2"]);
    expect(html).toContain(
      '<h2 id="setup-run">Setup &amp; run<a href="#setup-run" class="heading-anchor"',
    );
    expect(slugify("Cloud (multi-tenant) mode")).toBe("cloud-multi-tenant-mode");
  });
});
