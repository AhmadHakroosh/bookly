import { describe, expect, it } from "vitest";
import {
  configuredSocialProviders,
  socialErrorMessage,
  TRUSTED_SOCIAL_PROVIDERS,
} from "@/lib/social-providers";

describe("configuredSocialProviders", () => {
  it("offers nothing when no OAuth client is set", () => {
    expect(configuredSocialProviders({})).toEqual([]);
  });

  it("needs both the id and the secret", () => {
    expect(configuredSocialProviders({ GOOGLE_CLIENT_ID: "x" })).toEqual([]);
    expect(configuredSocialProviders({ GOOGLE_CLIENT_ID: "x", GOOGLE_CLIENT_SECRET: "y" })).toEqual(
      [{ id: "google", label: "Google" }],
    );
  });

  it("keeps a stable display order regardless of env order", () => {
    const env = {
      GITHUB_CLIENT_ID: "a",
      GITHUB_CLIENT_SECRET: "b",
      GOOGLE_CLIENT_ID: "c",
      GOOGLE_CLIENT_SECRET: "d",
    };
    expect(configuredSocialProviders(env).map((p) => p.id)).toEqual(["google", "github"]);
  });

  it("trusts the providers that verify email addresses, not GitHub", () => {
    expect(TRUSTED_SOCIAL_PROVIDERS).toEqual(["google", "microsoft"]);
  });
});

describe("socialErrorMessage", () => {
  it("explains a missing account differently on the cloud and on a self-hosted install", () => {
    expect(socialErrorMessage("signup_disabled", "google", true)).toMatch(/sign-up page/);
    expect(socialErrorMessage("signup_disabled", "google", false)).toMatch(/invitation/);
  });

  it("names the provider", () => {
    expect(socialErrorMessage("account_not_linked", "microsoft", true)).toContain("Microsoft");
    expect(socialErrorMessage("whatever", "github", true)).toContain("GitHub");
  });
});
