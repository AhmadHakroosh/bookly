import { describe, expect, it } from "vitest";
import { normalizeHost } from "@/server/domains";

describe("normalizeHost", () => {
  it("accepts and normalizes hostnames", () => {
    expect(normalizeHost(" Blog.Example.com ")).toBe("blog.example.com");
    expect(normalizeHost("https://blog.example.com/path")).toBe("blog.example.com");
    expect(normalizeHost("blog.example.com.")).toBe("blog.example.com");
    expect(normalizeHost("localhost:3000")).toBe("localhost:3000");
  });
  it("rejects junk", () => {
    expect(normalizeHost("not a host")).toBeNull();
    expect(normalizeHost("example")).toBeNull();
    expect(normalizeHost("")).toBeNull();
  });
});
