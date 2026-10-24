// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The contract between the AGPL core and the commercial modules in `ee/` (ADR 0006): feature
 * keys, module and license types, and the pure rules that decide whether a workspace may use a
 * commercial feature. Core imports this package; modules implement it. Nothing here unlocks
 * anything: with `ee/` absent there are no modules and every answer is "not installed".
 */

/** Commercial features. A shipped AGPL feature never moves into this list. */
export const EE_FEATURES = [
  "sso",
  "scim",
  "custom_roles",
  "org_admin",
  "anonymized_review",
  "compliance_reports",
  "retention_policies",
  "confidential_opportunities",
  "connectors",
  "audit_export",
] as const;
export type EeFeature = (typeof EE_FEATURES)[number];

export const isEeFeature = (v: unknown): v is EeFeature =>
  typeof v === "string" && (EE_FEATURES as readonly string[]).includes(v);

/* ---------------- Licenses ---------------- */

export type LicenseEdition = "enterprise" | "trial" | "development" | "cloud";

/** What a license key carries (format and signing live in ee/licensing). */
export type LicensePayload = {
  v: 1;
  /** Signing key id; the verifier knows public keys by id, so keys rotate without breaking old licenses. */
  kid: string;
  licenseId: string;
  customer: { id: string; name: string };
  edition: LicenseEdition;
  features: EeFeature[] | ["*"];
  /** Billable seats; null = unlimited. Over the limit warns, it never blocks (1.0). */
  seats: number | null;
  tenancy: "single" | "multi";
  /** Hosts (APP_URL) the key is for; empty or absent = any. */
  hosts?: string[];
  issuedAt: string;
  notBefore?: string;
  expiresAt: string;
  /** Days after expiry the features keep working, with warnings. */
  graceDays: number;
};

export type LicenseStatus =
  | { state: "missing" }
  | { state: "invalid"; reason: string }
  | { state: "valid" | "grace" | "expired"; license: LicensePayload; daysLeft: number };

/** What ee/licensing provides: verification is a pure function of the key and the clock. */
export type LicenseVerifier = {
  verify(raw: string, opts: { now: Date; host?: string }): LicenseStatus;
};

/* ---------------- Modules ---------------- */

/** What core hands a module at setup; grows as modules need more (never app internals). */
export type CoreServices = {
  appUrl: string;
  tenancy: "single" | "multi";
};

/** Every place core lets a module plug in. Core calls these only after the entitlement check. */
export type EeExtensions = Partial<{
  /** Background work, run through core's queue after an entitlement check. */
  jobs: Record<string, (data: Record<string, unknown>) => Promise<void>>;
}>;

export type EeModule = {
  id: string;
  /** Commercial features this module implements. */
  features: readonly EeFeature[];
  /** ee/licensing only: the key verifier. */
  verifier?: LicenseVerifier;
  setup?(core: CoreServices): EeExtensions;
};

/** The features the installed modules implement. */
export const installedFeatures = (modules: readonly EeModule[]): EeFeature[] => [
  ...new Set(modules.flatMap((m) => m.features)),
];

/** The license verifier, when ee/licensing is installed. */
export const verifierOf = (modules: readonly EeModule[]): LicenseVerifier | undefined =>
  modules.find((m) => m.verifier)?.verifier;

/* ---------------- Entitlements ---------------- */

export type EntitlementReason =
  /** No installed module implements the feature (Community, or `ee/` deleted). */
  | "not_installed"
  /** The module is installed but there is no license key. */
  | "missing"
  | "invalid"
  | "expired"
  /** The license does not include this feature. */
  | "not_licensed"
  /** Cloud: the workspace's plan and grants do not include it. */
  | "not_in_plan"
  /** A single-tenant license on a multi-tenant install. */
  | "wrong_tenancy";

export type Entitlement =
  | { ok: true; grace: boolean; daysLeft: number }
  | { ok: false; reason: EntitlementReason; detail?: string };

/**
 * Whether a workspace may use a commercial feature (ADR 0006, "Entitlement resolution"):
 * installed → license state → edition and tenancy. A `cloud` license (the hosted service)
 * takes the workspace's features from its plan and operator grants; an enterprise, trial or
 * development license applies its own feature list to the install.
 */
export function entitlement(input: {
  feature: EeFeature;
  installed: readonly EeFeature[];
  license: LicenseStatus;
  tenancy: "single" | "multi";
  /** Cloud: the workspace's plan features plus unexpired operator grants. */
  workspaceFeatures?: readonly EeFeature[];
}): Entitlement {
  const { feature, license } = input;
  if (!input.installed.includes(feature)) return { ok: false, reason: "not_installed" };
  if (license.state === "missing") return { ok: false, reason: "missing" };
  if (license.state === "invalid") return { ok: false, reason: "invalid", detail: license.reason };
  if (license.state === "expired")
    return { ok: false, reason: "expired", detail: license.license.expiresAt };
  const lic = license.license;
  const yes = { ok: true as const, grace: license.state === "grace", daysLeft: license.daysLeft };
  if (lic.edition === "cloud")
    return input.workspaceFeatures?.includes(feature) ? yes : { ok: false, reason: "not_in_plan" };
  if (lic.tenancy === "single" && input.tenancy === "multi")
    return { ok: false, reason: "wrong_tenancy" };
  const all = (lic.features as string[]).includes("*");
  return all || (lic.features as string[]).includes(feature)
    ? yes
    : { ok: false, reason: "not_licensed" };
}

/** Honest copy for an unavailable feature, shown instead of the feature. */
export function entitlementMessage(e: Entitlement): string | null {
  if (e.ok)
    return e.grace
      ? `Your Bookly license has expired. This keeps working for ${e.daysLeft} more day${e.daysLeft === 1 ? "" : "s"}; renew to keep it.`
      : null;
  switch (e.reason) {
    case "not_installed":
    case "missing":
      return "Available with Bookly Enterprise.";
    case "invalid":
      return `Your Bookly license key isn't valid${e.detail ? ` (${e.detail})` : ""}.`;
    case "expired":
      return `Your Bookly license expired on ${e.detail?.slice(0, 10) ?? "an earlier date"}.`;
    case "not_licensed":
      return "Your Bookly license doesn't include this. Contact us to add it.";
    case "not_in_plan":
      return "Available on Bookly Enterprise plans.";
    case "wrong_tenancy":
      return "This license is for a single-workspace install.";
  }
}
