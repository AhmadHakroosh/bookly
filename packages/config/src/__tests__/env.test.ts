import { describe, expect, it } from "vitest";
import { envSchema } from "../index";

const base = { DATABASE_URL: "postgres://u:p@localhost:5432/db", AUTH_SECRET: "0123456789abcdef" };

describe("envSchema", () => {
  it("applies self-host defaults", () => {
    const env = envSchema.parse(base);
    expect(env.TENANCY).toBe("single");
    expect(env.EMAIL_DRIVER).toBe("console");
    expect(env.APP_URL).toBe("http://localhost:3002");
  });

  it("rejects a short AUTH_SECRET", () => {
    expect(envSchema.safeParse({ ...base, AUTH_SECRET: "short" }).success).toBe(false);
  });

  it("parses booleans and numbers from strings", () => {
    const env = envSchema.parse({
      ...base,
      SMTP_SECURE: "true",
      SMTP_PORT: "465",
      TELEMETRY: "off",
    });
    expect(env.SMTP_SECURE).toBe(true);
    expect(env.SMTP_PORT).toBe(465);
    expect(env.TELEMETRY).toBe("off");
  });
});
