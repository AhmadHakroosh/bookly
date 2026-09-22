import { describe, expect, it } from "vitest";
import { isBlocked, parseBlocklist } from "@/server/abuse";

describe("blocklist", () => {
  it("parses lines and matches addresses or whole domains", () => {
    const list = parseBlocklist("Spammer@Example.com\n@throwaway.example\n\n , dup@x.io; dup@x.io");
    expect(list).toEqual(["spammer@example.com", "@throwaway.example", "dup@x.io"]);
    expect(isBlocked("spammer@example.com", list)).toBe(true);
    expect(isBlocked("SPAMMER@example.com ", list)).toBe(true);
    expect(isBlocked("anyone@throwaway.example", list)).toBe(true);
    expect(isBlocked("fine@example.com", list)).toBe(false);
    expect(isBlocked("fine@example.com", undefined)).toBe(false);
  });
});

describe("metrics text", () => {
  it("renders gauges with help/type once per name and escaped labels", async () => {
    const { renderMetrics } = await import("@/server/metrics-text");
    const out = renderMetrics([
      { name: "a", help: "A", value: 1 },
      { name: "b", help: "B", value: 2, labels: { plan: "pro" } },
      { name: "b", help: "B", value: 3, labels: { plan: 'x"y' } },
    ]);
    expect(out).toContain("# HELP a A\n# TYPE a gauge\na 1");
    expect(out.match(/# TYPE b gauge/g)).toHaveLength(1);
    expect(out).toContain('b{plan="pro"} 2');
    expect(out).toContain('b{plan="x\\"y"} 3');
  });
});
