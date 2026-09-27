import { describe, expect, it } from "vitest";
import { envSchema, withPlatformDefaults } from "../index";

const base = { DATABASE_URL: "postgres://u:p@localhost:5432/db", AUTH_SECRET: "0123456789abcdef" };

describe("envSchema", () => {
  it("applies self-host defaults", () => {
    const env = envSchema.parse(base);
    expect(env.TENANCY).toBe("single");
    expect(env.EMAIL_DRIVER).toBe("console");
    expect(env.APP_URL).toBe("http://localhost:3002");
  });

  it("takes the Vercel preview URL as APP_URL when none is set", () => {
    expect(withPlatformDefaults({ VERCEL_URL: "bookly-abc123.vercel.app" }).APP_URL).toBe(
      "https://bookly-abc123.vercel.app",
    );
    expect(
      withPlatformDefaults({ VERCEL_URL: "bookly-abc123.vercel.app", APP_URL: "https://x.test" })
        .APP_URL,
    ).toBe("https://x.test");
    expect(withPlatformDefaults({}).APP_URL).toBeUndefined();
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
