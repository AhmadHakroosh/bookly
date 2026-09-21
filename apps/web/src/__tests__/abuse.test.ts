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
