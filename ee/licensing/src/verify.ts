// SPDX-License-Identifier: Elastic-2.0
import { createPublicKey, verify as verifySignature, type KeyObject } from "node:crypto";
import {
  isEeFeature,
  type LicensePayload,
  type LicenseStatus,
  type LicenseVerifier,
} from "@bookly/editions";

/**
 * Bookly license keys (ADR 0006): `bookly_lic_1.<payload>.<signature>`, both parts base64url,
 * the signature Ed25519 over `bookly_lic_1.<payload>`. Verification needs only the public key
 * named by the payload's `kid` and the clock: no network, ever.
 */
export const LICENSE_PREFIX = "bookly_lic_1";
const DAY = 86_400_000;
const EDITIONS = new Set(["enterprise", "trial", "development", "cloud"]);

const b64url = (buf: Buffer) => buf.toString("base64url");
export const encodePayload = (p: LicensePayload) => b64url(Buffer.from(JSON.stringify(p)));
export const signingInput = (payloadPart: string) => `${LICENSE_PREFIX}.${payloadPart}`;

const isDate = (v: unknown): v is string => typeof v === "string" && !Number.isNaN(Date.parse(v));

/** The payload's shape, field by field; a reason when it is wrong. */
export function payloadProblem(p: unknown): string | null {
  if (!p || typeof p !== "object") return "not an object";
  const o = p as Record<string, unknown>;
  if (o.v !== 1) return "unknown version";
  if (typeof o.kid !== "string" || !o.kid) return "missing key id";
  if (typeof o.licenseId !== "string" || !o.licenseId) return "missing license id";
  const c = o.customer as Record<string, unknown> | undefined;
  if (!c || typeof c.id !== "string" || typeof c.name !== "string") return "missing customer";
  if (typeof o.edition !== "string" || !EDITIONS.has(o.edition)) return "unknown edition";
  const f = o.features;
  const wildcard = Array.isArray(f) && f.length === 1 && f[0] === "*";
  if (!Array.isArray(f) || (!wildcard && !f.every(isEeFeature))) return "unknown features";
  if (o.seats !== null && !(typeof o.seats === "number" && o.seats >= 0)) return "bad seats";
  if (o.tenancy !== "single" && o.tenancy !== "multi") return "bad tenancy";
  if (
    o.hosts !== undefined &&
    !(Array.isArray(o.hosts) && o.hosts.every((h) => typeof h === "string"))
  )
    return "bad hosts";
  if (!isDate(o.issuedAt) || !isDate(o.expiresAt)) return "bad dates";
  if (o.notBefore !== undefined && !isDate(o.notBefore)) return "bad dates";
  if (typeof o.graceDays !== "number" || o.graceDays < 0) return "bad grace period";
  return null;
}

const hostOf = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

/** A verifier over the given public keys (raw 32-byte Ed25519 keys, base64url, by kid). */
export function createVerifier(publicKeys: Record<string, string>): LicenseVerifier {
  const keys = new Map<string, KeyObject>();
  for (const [kid, raw] of Object.entries(publicKeys))
    keys.set(kid, createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: raw }, format: "jwk" }));

  return {
    verify(raw, { now, host }): LicenseStatus {
      const token = raw.trim();
      if (!token) return { state: "missing" };
      const parts = token.split(".");
      if (parts.length !== 3 || parts[0] !== LICENSE_PREFIX)
        return { state: "invalid", reason: "not a Bookly license key" };
      const [, payloadPart, sigPart] = parts as [string, string, string];
      let payload: LicensePayload;
      try {
        payload = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8"));
      } catch {
        return { state: "invalid", reason: "unreadable key" };
      }
      const problem = payloadProblem(payload);
      if (problem) return { state: "invalid", reason: problem };
      const key = keys.get(payload.kid);
      if (!key) return { state: "invalid", reason: "signed with an unknown key" };
      const ok = verifySignature(
        null,
        Buffer.from(signingInput(payloadPart)),
        key,
        Buffer.from(sigPart, "base64url"),
      );
      if (!ok) return { state: "invalid", reason: "signature does not match" };
      if (host && payload.hosts?.length && !payload.hosts.map(hostOf).includes(hostOf(host)))
        return { state: "invalid", reason: "issued for another host" };
      if (payload.notBefore && Date.parse(payload.notBefore) > now.getTime())
        return { state: "invalid", reason: "not valid yet" };
      const end = Date.parse(payload.expiresAt);
      const graceEnd = end + payload.graceDays * DAY;
      const t = now.getTime();
      if (t <= end)
        return { state: "valid", license: payload, daysLeft: Math.ceil((end - t) / DAY) };
      if (t <= graceEnd)
        return { state: "grace", license: payload, daysLeft: Math.ceil((graceEnd - t) / DAY) };
      return { state: "expired", license: payload, daysLeft: 0 };
    },
  };
}
