// SPDX-License-Identifier: Elastic-2.0
/**
 * Issues Bookly license keys. Run by Cloudeo only; the private signing keys never enter the
 * repository.
 *
 *   pnpm --filter @bookly/ee-licensing issue keygen k2
 *     Creates an Ed25519 signing key, writes the private JWK to ~/.config/bookly/ (mode 600)
 *     and prints the public key to add to src/keys.ts.
 *
 *   pnpm --filter @bookly/ee-licensing issue sign --customer-id acme --customer-name "Acme" \
 *     --edition trial --features "*" --days 30 [--grace 0] [--seats 25] [--tenancy single]
 *     [--host https://bookly.acme.example] [--kid k1]
 *     Prints a license key. The signing key comes from BOOKLY_LICENSE_SIGNING_KEY (a path to the
 *     private JWK) or ~/.config/bookly/license-signing-<kid>.jwk.
 */
import { generateKeyPairSync, createPrivateKey, randomUUID, sign } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { isEeFeature, type LicensePayload } from "@bookly/editions";
import { encodePayload, LICENSE_PREFIX, payloadProblem, signingInput } from "../src/verify";

const keyPath = (kid: string) =>
  process.env.BOOKLY_LICENSE_SIGNING_KEY ??
  path.join(homedir(), ".config", "bookly", `license-signing-${kid}.jwk`);

function keygen(kid: string) {
  const file = path.join(homedir(), ".config", "bookly", `license-signing-${kid}.jwk`);
  if (existsSync(file)) throw new Error(`${file} exists; pick a new key id`);
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  writeFileSync(file, JSON.stringify(privateKey.export({ format: "jwk" })), { mode: 0o600 });
  const { x } = publicKey.export({ format: "jwk" });
  console.log(`Private key: ${file} (keep it in a password manager or KMS, never in git)`);
  console.log(`Add to ee/licensing/src/keys.ts:\n  ${kid}: "${x}",`);
}

const DEFAULT_GRACE: Record<LicensePayload["edition"], number> = {
  enterprise: 30,
  cloud: 30,
  trial: 0,
  development: 0,
};

function issue(args: string[]) {
  const { values: v } = parseArgs({
    args,
    options: {
      "customer-id": { type: "string" },
      "customer-name": { type: "string" },
      edition: { type: "string" },
      features: { type: "string", default: "*" },
      seats: { type: "string", default: "unlimited" },
      tenancy: { type: "string", default: "single" },
      days: { type: "string" },
      grace: { type: "string" },
      host: { type: "string", multiple: true },
      kid: { type: "string", default: "k1" },
    },
  });
  const edition = v.edition as LicensePayload["edition"];
  const features =
    v.features === "*" ? (["*"] as ["*"]) : v.features!.split(",").map((f) => f.trim());
  if (features[0] !== "*" && !features.every(isEeFeature))
    throw new Error(`Unknown feature in "${v.features}"`);
  const now = new Date();
  const days = Number(v.days);
  if (!Number.isFinite(days) || days <= 0) throw new Error("--days must be a positive number");
  const payload: LicensePayload = {
    v: 1,
    kid: v.kid!,
    licenseId: randomUUID(),
    customer: { id: v["customer-id"] ?? "", name: v["customer-name"] ?? "" },
    edition,
    features: features as LicensePayload["features"],
    seats: v.seats === "unlimited" ? null : Number(v.seats),
    tenancy: v.tenancy as "single" | "multi",
    ...(v.host?.length ? { hosts: v.host } : {}),
    issuedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + days * 86_400_000).toISOString(),
    graceDays: v.grace !== undefined ? Number(v.grace) : (DEFAULT_GRACE[edition] ?? 0),
  };
  const problem = payloadProblem(payload);
  if (problem) throw new Error(`Invalid license: ${problem}`);
  const key = createPrivateKey({
    key: JSON.parse(readFileSync(keyPath(payload.kid), "utf8")),
    format: "jwk",
  });
  const payloadPart = encodePayload(payload);
  const sig = sign(null, Buffer.from(signingInput(payloadPart)), key).toString("base64url");
  console.log(`${LICENSE_PREFIX}.${payloadPart}.${sig}`);
}

const [command, ...rest] = process.argv.slice(2);
try {
  if (command === "keygen" && rest[0]) keygen(rest[0]);
  else if (command === "sign") issue(rest);
  else {
    console.error("Usage: issue keygen <kid> | issue sign --customer-id … --edition … --days …");
    process.exit(2);
  }
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
