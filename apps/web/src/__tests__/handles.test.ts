import { describe, expect, it } from "vitest";
import { checkHandle, imitatedBrand, skeleton, slugify, trustWord } from "@/lib/handles";

const bad = (raw: string, kind: "address" | "username" = "address") => {
  const r = checkHandle(raw, kind);
  return r.ok ? null : r.error;
};

describe("checkHandle", () => {
  it("accepts ordinary handles and lowercases them", () => {
    expect(checkHandle("Acme-Studio", "address")).toEqual({ ok: true, value: "acme-studio" });
    expect(checkHandle("jane", "username")).toEqual({ ok: true, value: "jane" });
    expect(checkHandle("a1", "username")).toEqual({ ok: true, value: "a1" });
  });
  it("names the exact format problem", () => {
    expect(bad("")).toMatch(/Pick an address/);
    expect(bad("ab")).toMatch(/At least 3/);
    expect(bad("a", "username")).toMatch(/At least 2/);
    expect(bad("x".repeat(41))).toMatch(/At most 40/);
    expect(bad("jane doe")).toMatch(/Only lowercase/);
    expect(bad("jané")).toMatch(/Only lowercase/);
    expect(bad("-acme")).toMatch(/hyphen/);
    expect(bad("acme-")).toMatch(/hyphen/);
    expect(bad("ac--me")).toMatch(/two hyphens/);
  });
  it("refuses platform, environment and mail subdomains", () => {
    for (const s of ["www", "api", "staging", "dev", "preview", "mail", "smtp", "bookly-app"])
      expect(bad(s), s).toMatch(/reserved/);
  });
  it("refuses usernames that would shadow app routes, but allows them as plain words elsewhere", () => {
    for (const s of ["admin", "booking", "api", "waitlist", "accept-invitation"])
      expect(bad(s, "username"), s).toMatch(/reserved/);
    // Too short or badly formed handles never reach the route check but are refused all the same.
    expect(checkHandle("r", "username").ok).toBe(false);
    expect(checkHandle("_next", "username").ok).toBe(false);
    expect(checkHandle("support", "username").ok).toBe(true);
    expect(checkHandle("demo", "username").ok).toBe(true);
  });
  it("refuses look-alikes of the platform and well-known services", () => {
    expect(bad("bookly")).toMatch(/reserved/);
    for (const s of ["book-ly", "b00kly", "my-bookly", "paypa1", "g00gle-calendar", "str1pe"])
      expect(bad(s), s).toMatch(/imitates/);
    expect(bad("micros0ft", "username")).toMatch(/imitates/);
  });
  it("refuses addresses built from sign-in and payment words", () => {
    for (const s of ["acme-login", "secure-pay", "account-verify", "billing-acme", "support"])
      expect(bad(s), s).toMatch(/isn't allowed|reserved/);
    // Usernames on a tenant host are not held to the trust-word rule.
    expect(checkHandle("acme-support", "username").ok).toBe(true);
  });
  it("does not trip over ordinary words that contain a short brand", () => {
    for (const s of [
      "purchase-club",
      "startups-hub",
      "clockwise",
      "pineapple-farm",
      "zoom-coaching",
    ])
      expect(checkHandle(s, "address").ok, s).toBe(true);
  });
});

describe("helpers", () => {
  it("skeleton folds hyphens and leetspeak", () => {
    expect(skeleton("b00k-ly")).toBe("bookly");
    expect(skeleton("paypa1")).toBe("paypal");
  });
  it("imitatedBrand and trustWord report what matched", () => {
    expect(imitatedBrand("the-stripe-shop")).toBe("stripe");
    expect(imitatedBrand("acme")).toBeNull();
    expect(trustWord("acme-login")).toBe("login");
    expect(trustWord("loginacme")).toBeNull();
  });
  it("slugify suggests a handle from a name", () => {
    expect(slugify("Jane Doe")).toBe("jane-doe");
    expect(slugify("  Café Ünïcode! ")).toBe("cafe-unicode");
    expect(slugify("x".repeat(50))).toHaveLength(40);
  });
});
