import { describe, expect, it } from "vitest";
import { passkeyRpId } from "@/lib/passkey-rp";

describe("passkeyRpId", () => {
  it("uses the root domain in cloud mode, without a port", () => {
    expect(
      passkeyRpId({
        TENANCY: "multi",
        ROOT_DOMAIN: "bookly-app.io",
        APP_URL: "https://bookly-app.io",
      }),
    ).toBe("bookly-app.io");
    expect(
      passkeyRpId({
        TENANCY: "multi",
        ROOT_DOMAIN: "bookly.test:3011",
        APP_URL: "http://platform.bookly.test:3011",
      }),
    ).toBe("bookly.test");
  });
  it("uses the app host for a self-hosted install", () => {
    expect(passkeyRpId({ TENANCY: "single", APP_URL: "https://book.example.com" })).toBe(
      "book.example.com",
    );
    expect(passkeyRpId({ TENANCY: "single", APP_URL: "http://localhost:3002" })).toBe("localhost");
  });
});
