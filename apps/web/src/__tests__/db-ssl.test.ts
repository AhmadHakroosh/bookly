import { describe, expect, it } from "vitest";
import { normalizeConnectionString } from "@bookly/db";

describe("normalizeConnectionString", () => {
  it("upgrades alias SSL modes to verify-full", () => {
    expect(normalizeConnectionString("postgres://u:p@h/db?sslmode=require")).toBe(
      "postgres://u:p@h/db?sslmode=verify-full",
    );
    expect(normalizeConnectionString("postgres://u:p@h/db?a=1&sslmode=prefer&b=2")).toBe(
      "postgres://u:p@h/db?a=1&sslmode=verify-full&b=2",
    );
  });
  it("leaves other strings alone", () => {
    expect(normalizeConnectionString("postgres://u:p@localhost:5432/db")).toBe(
      "postgres://u:p@localhost:5432/db",
    );
    expect(normalizeConnectionString("postgres://u:p@h/db?sslmode=disable")).toBe(
      "postgres://u:p@h/db?sslmode=disable",
    );
  });
});
