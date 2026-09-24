import { describe, expect, it } from "vitest";
import { normalizeHost } from "@/server/domains";

describe("normalizeHost", () => {
  it("accepts and normalizes hostnames", () => {
    expect(normalizeHost(" Book.Example.com ")).toBe("book.example.com");
    expect(normalizeHost("https://book.example.com/path")).toBe("book.example.com");
    expect(normalizeHost("book.example.com.")).toBe("book.example.com");
    expect(normalizeHost("localhost:3000")).toBe("localhost:3000");
  });
  it("rejects junk", () => {
    expect(normalizeHost("not a host")).toBeNull();
    expect(normalizeHost("example")).toBeNull();
    expect(normalizeHost("")).toBeNull();
  });
});
