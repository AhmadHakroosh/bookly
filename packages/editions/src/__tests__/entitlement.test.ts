import { describe, expect, it } from "vitest";
import {
  entitlement,
  entitlementMessage,
  installedFeatures,
  verifierOf,
  type EeModule,
  type LicensePayload,
  type LicenseStatus,
} from "../index";

/** A stand-in for real ee/ modules: one feature module and a verifier that returns `status`. */
const fixture = (status: LicenseStatus): EeModule[] => [
  { id: "sso", features: ["sso", "scim"] },
  { id: "license", features: [], verifier: { verify: () => status } },
];

const lic = (o: Partial<LicensePayload> = {}): LicensePayload => ({
  v: 1,
  kid: "k1",
  licenseId: "l",
  customer: { id: "c", name: "C" },
  edition: "enterprise",
  features: ["sso"],
  seats: null,
  tenancy: "single",
  issuedAt: "2026-01-01T00:00:00Z",
  expiresAt: "2027-01-01T00:00:00Z",
  graceDays: 30,
  ...o,
});
const valid = (o?: Partial<LicensePayload>): LicenseStatus => ({
  state: "valid",
  license: lic(o),
  daysLeft: 69,
});

const check = (status: LicenseStatus, extra: Partial<Parameters<typeof entitlement>[0]> = {}) => {
  const modules = fixture(status);
  return entitlement({
    feature: "sso",
    installed: installedFeatures(modules),
    license: verifierOf(modules)!.verify("", { now: new Date() }),
    tenancy: "single",
    ...extra,
  });
};

describe("entitlement", () => {
  it("is not installed without a module, whatever the license says", () => {
    expect(
      entitlement({ feature: "sso", installed: [], license: valid(), tenancy: "single" }),
    ).toEqual({ ok: false, reason: "not_installed" });
  });

  it("follows the license state", () => {
    expect(check({ state: "missing" })).toEqual({ ok: false, reason: "missing" });
    expect(check({ state: "invalid", reason: "bad" })).toMatchObject({
      ok: false,
      reason: "invalid",
    });
    expect(check({ state: "expired", license: lic(), daysLeft: 0 })).toMatchObject({
      ok: false,
      reason: "expired",
    });
    expect(check(valid())).toEqual({ ok: true, grace: false, daysLeft: 69 });
    expect(check({ state: "grace", license: lic(), daysLeft: 3 })).toEqual({
      ok: true,
      grace: true,
      daysLeft: 3,
    });
  });

  it("applies an enterprise license's feature list to the install", () => {
    expect(check(valid(), { feature: "scim" })).toEqual({ ok: false, reason: "not_licensed" });
    expect(check(valid({ features: ["*"] }), { feature: "scim" }).ok).toBe(true);
    expect(check(valid(), { tenancy: "multi" })).toEqual({ ok: false, reason: "wrong_tenancy" });
    expect(check(valid({ tenancy: "multi" }), { tenancy: "multi" }).ok).toBe(true);
  });

  it("takes a cloud workspace's features from its plan and grants", () => {
    const cloud = valid({ edition: "cloud", tenancy: "multi", features: ["*"] });
    expect(check(cloud, { tenancy: "multi" })).toEqual({ ok: false, reason: "not_in_plan" });
    expect(check(cloud, { tenancy: "multi", workspaceFeatures: ["sso"] }).ok).toBe(true);
  });

  it("says why in plain words", () => {
    expect(entitlementMessage({ ok: false, reason: "not_installed" })).toBe(
      "Available with Bookly Enterprise.",
    );
    expect(
      entitlementMessage({ ok: false, reason: "expired", detail: "2026-09-30T00:00:00Z" }),
    ).toBe("Your Bookly license expired on 2026-09-30.");
    expect(entitlementMessage({ ok: true, grace: true, daysLeft: 1 })).toContain("1 more day;");
    expect(entitlementMessage({ ok: true, grace: false, daysLeft: 10 })).toBeNull();
  });
});
