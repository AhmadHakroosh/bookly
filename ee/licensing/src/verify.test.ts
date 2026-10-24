// SPDX-License-Identifier: Elastic-2.0
import { generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { LicensePayload } from "@bookly/editions";
import license from "./index";
import { PUBLIC_KEYS } from "./keys";
import { createVerifier, encodePayload, LICENSE_PREFIX, signingInput } from "./verify";

const DAY = 86_400_000;
const now = new Date("2026-10-24T12:00:00Z");
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const verifier = createVerifier({ test: publicKey.export({ format: "jwk" }).x! });

const payload = (o: Partial<LicensePayload> = {}): LicensePayload => ({
  v: 1,
  kid: "test",
  licenseId: "lic_1",
  customer: { id: "acme", name: "Acme" },
  edition: "enterprise",
  features: ["sso", "scim"],
  seats: 25,
  tenancy: "single",
  issuedAt: new Date(now.getTime() - DAY).toISOString(),
  expiresAt: new Date(now.getTime() + 10 * DAY).toISOString(),
  graceDays: 30,
  ...o,
});

const issue = (p: unknown, key: KeyObject = privateKey) => {
  const part = Buffer.from(JSON.stringify(p)).toString("base64url");
  return `${LICENSE_PREFIX}.${part}.${sign(null, Buffer.from(signingInput(part)), key).toString("base64url")}`;
};

describe("license keys", () => {
  it("verifies a valid key and counts the days left", () => {
    const s = verifier.verify(issue(payload()), { now });
    expect(s).toMatchObject({ state: "valid", daysLeft: 10 });
    if (s.state === "valid") expect(s.license.features).toEqual(["sso", "scim"]);
  });

  it("keeps working in the grace period, then expires", () => {
    const ended = payload({ expiresAt: new Date(now.getTime() - 5 * DAY).toISOString() });
    expect(verifier.verify(issue(ended), { now })).toMatchObject({ state: "grace", daysLeft: 25 });
    const long = payload({ expiresAt: new Date(now.getTime() - 31 * DAY).toISOString() });
    expect(verifier.verify(issue(long), { now })).toMatchObject({ state: "expired", daysLeft: 0 });
    const trial = payload({
      edition: "trial",
      graceDays: 0,
      expiresAt: new Date(now.getTime() - 1).toISOString(),
    });
    expect(verifier.verify(issue(trial), { now }).state).toBe("expired");
  });

  it("treats an empty key as missing", () => {
    expect(verifier.verify("  ", { now })).toEqual({ state: "missing" });
  });

  it("rejects keys that are not ours, tampered or broken", () => {
    const reason = (raw: string) => {
      const s = verifier.verify(raw, { now });
      return s.state === "invalid" ? s.reason : s.state;
    };
    expect(reason("jwt.abc.def")).toBe("not a Bookly license key");
    expect(reason(`${LICENSE_PREFIX}.!!!.x`)).toBe("unreadable key");
    // Another key signed it.
    const other = generateKeyPairSync("ed25519").privateKey;
    expect(reason(issue(payload(), other))).toBe("signature does not match");
    // Seats raised after signing.
    const [, part, sig] = issue(payload()).split(".");
    const raised = encodePayload({
      ...JSON.parse(Buffer.from(part!, "base64url").toString()),
      seats: 9999,
    });
    expect(reason(`${LICENSE_PREFIX}.${raised}.${sig}`)).toBe("signature does not match");
    expect(reason(issue(payload({ kid: "nope" })))).toBe("signed with an unknown key");
    expect(reason(issue(payload({ features: ["sso", "teleport" as never] })))).toBe(
      "unknown features",
    );
    expect(reason(issue({ ...payload(), v: 2 }))).toBe("unknown version");
  });

  it("honours hosts and not-before", () => {
    const pinned = issue(payload({ hosts: ["https://bookly.acme.example"] }));
    expect(verifier.verify(pinned, { now, host: "https://bookly.acme.example/" }).state).toBe(
      "valid",
    );
    expect(verifier.verify(pinned, { now, host: "https://elsewhere.example" })).toMatchObject({
      state: "invalid",
      reason: "issued for another host",
    });
    const later = issue(payload({ notBefore: new Date(now.getTime() + DAY).toISOString() }));
    expect(verifier.verify(later, { now })).toMatchObject({
      state: "invalid",
      reason: "not valid yet",
    });
  });

  it("ships Bookly's public keys and a verifier as the license module", () => {
    expect(Object.keys(PUBLIC_KEYS).length).toBeGreaterThan(0);
    expect(license.features).toEqual([]);
    expect(license.verifier?.verify(issue(payload()), { now }).state).toBe("invalid");
  });
});
