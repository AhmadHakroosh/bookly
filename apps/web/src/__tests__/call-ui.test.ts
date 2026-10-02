import { describe, expect, it } from "vitest";
import {
  detectedLang,
  formatClock,
  gridColumns,
  initials,
  parseCallMessage,
  tileWidth,
} from "@/app/meet/[room]/messages";

describe("call messages", () => {
  it("accepts chat and known reactions, drops anything else", () => {
    expect(parseCallMessage({ kind: "chat", id: "a", name: " Ada ", text: " hi ", at: 5 })).toEqual(
      {
        kind: "chat",
        id: "a",
        name: "Ada",
        text: "hi",
        at: 5,
      },
    );
    expect(parseCallMessage({ kind: "reaction", emoji: "👍", at: 1 })).toMatchObject({
      kind: "reaction",
      emoji: "👍",
      name: "Someone",
    });
    expect(parseCallMessage({ kind: "reaction", emoji: "💣" })).toBeNull();
    expect(parseCallMessage({ kind: "chat", text: "   " })).toBeNull();
    expect(parseCallMessage("chat")).toBeNull();
    expect(parseCallMessage(null)).toBeNull();
  });
  it("caps lengths and invents ids and timestamps", () => {
    const m = parseCallMessage({ kind: "chat", name: "x".repeat(100), text: "y".repeat(3000) })!;
    expect(m.name).toHaveLength(60);
    expect(m.kind === "chat" && m.text).toHaveLength(2000);
    expect(m.id).toBeTruthy();
    expect(typeof m.at).toBe("number");
  });
});

describe("tile grid", () => {
  it("picks the column count that gives the largest 16:9 tiles", () => {
    expect(gridColumns(1, 1200, 700)).toBe(1);
    expect(gridColumns(2, 1600, 700)).toBe(2);
    expect(gridColumns(2, 1200, 700)).toBe(1); // wide-ish: two stacked tiles are larger
    expect(gridColumns(2, 400, 1000)).toBe(1); // portrait phone: stack
    expect(gridColumns(4, 1200, 700)).toBe(2);
    expect(gridColumns(9, 1600, 900)).toBe(3);
    expect(gridColumns(0, 0, 0)).toBe(1);
  });
  it("sizes tiles to fit both width and height", () => {
    expect(tileWidth(2, 2, 1208, 700)).toBe(600);
    expect(tileWidth(4, 2, 1208, 500, 8)).toBe(Math.floor(((500 - 8) / 2) * (16 / 9)));
    expect(tileWidth(1, 1, 50, 50)).toBe(80);
  });
});

describe("formatting", () => {
  it("initials and clocks", () => {
    expect(initials("Ahmad Hakroosh")).toBe("AH");
    expect(initials("  ada ")).toBe("A");
    expect(initials("")).toBe("?");
    expect(initials("Mary Jane Watson")).toBe("MJ");
    expect(formatClock(65.9)).toBe("01:05");
  });
  it("reads Deepgram's detected language from the raw response", () => {
    expect(detectedLang({ channel: { alternatives: [{ languages: ["es", "en"] }] } })).toBe("es");
    expect(detectedLang({ channel: { alternatives: [{}] } })).toBeUndefined();
    expect(detectedLang(undefined)).toBeUndefined();
  });
});
