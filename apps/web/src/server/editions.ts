import "server-only";
import { readFileSync } from "node:fs";
import { cache } from "react";
import { effectivePlan } from "@bookly/cloud";
import { loadEnv } from "@bookly/config";
import { and, eq, gt, isNull, or, schema } from "@bookly/db";
import type { Workspace } from "@bookly/db/schema";
import {
  entitlement,
  entitlementMessage,
  installedFeatures,
  isEeFeature,
  verifierOf,
  type EeFeature,
  type Entitlement,
  type LicenseStatus,
} from "@bookly/editions";
import { db } from "@/lib/db";
import { decrypt, encrypt } from "@/lib/crypto";
import { EE_MODULES } from "./editions/registry.generated";

/**
 * Commercial features (ADR 0006). The order of checks in a feature is: `hasFlag` (does it
 * exist yet) → `hasEe` (commercial entitlement) → plan limits → role. With `ee/` deleted the
 * registry is empty and every answer is "not installed": the AGPL core is complete on its own.
 */

const STATE_KEY = "license";
const RECHECK_MS = 60 * 60_000;

/** Thrown by `assertEe` in actions, like `LimitError`. */
export class EditionError extends Error {
  constructor(
    message: string,
    public readonly reason: Exclude<Entitlement, { ok: true }>["reason"],
  ) {
    super(message);
  }
}

export const eeInstalled = () => EE_MODULES.length > 0;
export const installedEeFeatures = () => installedFeatures(EE_MODULES);

/** Where the install's key comes from: the environment wins over a key pasted in the admin. */
export type LicenseSource = "env" | "file" | "admin" | null;

async function rawLicense(): Promise<{ raw: string; source: LicenseSource }> {
  const env = loadEnv();
  if (env.BOOKLY_LICENSE_KEY) return { raw: env.BOOKLY_LICENSE_KEY, source: "env" };
  if (env.BOOKLY_LICENSE_FILE) {
    try {
      return { raw: readFileSync(env.BOOKLY_LICENSE_FILE, "utf8"), source: "file" };
    } catch {
      return { raw: "", source: "file" };
    }
  }
  const row = await db().query.platformState.findFirst({
    where: eq(schema.platformState.key, STATE_KEY),
  });
  const v = row?.value as { key?: string } | undefined;
  if (!v?.key) return { raw: "", source: null };
  try {
    return { raw: decrypt(v.key), source: "admin" };
  } catch {
    return { raw: "", source: "admin" };
  }
}

let checked: { at: number; status: LicenseStatus; source: LicenseSource } | null = null;

/**
 * The install's license, verified offline by ee/licensing. Cached per process and re-checked
 * hourly (verification is a pure function of the key and the clock) or when the key changes.
 */
export async function licenseStatus(): Promise<{ status: LicenseStatus; source: LicenseSource }> {
  if (checked && Date.now() - checked.at < RECHECK_MS) return checked;
  const { raw, source } = await rawLicense();
  const verifier = verifierOf(EE_MODULES);
  const status: LicenseStatus = !raw.trim()
    ? { state: "missing" }
    : verifier
      ? verifier.verify(raw, { now: new Date(), host: loadEnv().APP_URL })
      : // A key without ee/licensing (the -core image): nothing can use it anyway.
        { state: "invalid", reason: "this build has no commercial modules" };
  checked = { at: Date.now(), status, source };
  return checked;
}

/** Stores a key pasted by an owner (encrypted at rest) and re-verifies. */
export async function saveLicenseKey(raw: string): Promise<LicenseStatus> {
  const verifier = verifierOf(EE_MODULES);
  const status = verifier?.verify(raw, { now: new Date(), host: loadEnv().APP_URL });
  if (!status || status.state === "missing" || status.state === "invalid")
    return status ?? { state: "missing" };
  const value = { key: encrypt(raw.trim()) };
  await db()
    .insert(schema.platformState)
    .values({ key: STATE_KEY, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: schema.platformState.key,
      set: { value, updatedAt: new Date() },
    });
  checked = null;
  return status;
}

export async function removeLicenseKey(): Promise<void> {
  await db().delete(schema.platformState).where(eq(schema.platformState.key, STATE_KEY));
  checked = null;
}

/** Cloud: the workspace's commercial features from its plan and unexpired operator grants. */
const workspaceFeatures = cache(async (ws: Workspace): Promise<EeFeature[]> => {
  // A lapsed paid plan counts as Free, exactly as for limits.
  const fromPlan = effectivePlan(ws.plan, ws.planStatus)?.ee ?? [];
  const grants = await db()
    .select({ feature: schema.workspaceEntitlements.feature })
    .from(schema.workspaceEntitlements)
    .where(
      and(
        eq(schema.workspaceEntitlements.workspaceId, ws.id),
        or(
          isNull(schema.workspaceEntitlements.expiresAt),
          gt(schema.workspaceEntitlements.expiresAt, new Date()),
        ),
      ),
    );
  return [...new Set([...fromPlan, ...grants.map((g) => g.feature).filter(isEeFeature)])];
});

/** Whether the workspace may use a commercial feature, and why not when it may not. */
export const eeEntitlement = cache(
  async (ws: Workspace, feature: EeFeature): Promise<Entitlement> => {
    const installed = installedEeFeatures();
    if (!installed.includes(feature)) return { ok: false, reason: "not_installed" };
    const { status } = await licenseStatus();
    const cloud =
      status.state !== "missing" &&
      status.state !== "invalid" &&
      status.license.edition === "cloud";
    return entitlement({
      feature,
      installed,
      license: status,
      tenancy: loadEnv().TENANCY,
      workspaceFeatures: cloud ? await workspaceFeatures(ws) : undefined,
    });
  },
);

export async function hasEe(ws: Workspace, feature: EeFeature): Promise<boolean> {
  return (await eeEntitlement(ws, feature)).ok;
}

export async function assertEe(ws: Workspace, feature: EeFeature): Promise<void> {
  const e = await eeEntitlement(ws, feature);
  if (!e.ok) throw new EditionError(entitlementMessage(e) ?? "Not available.", e.reason);
}

/* ---------------- Operator grants (cloud) ---------------- */

export async function listWorkspaceEntitlements(workspaceId: string) {
  return db()
    .select()
    .from(schema.workspaceEntitlements)
    .where(eq(schema.workspaceEntitlements.workspaceId, workspaceId))
    .orderBy(schema.workspaceEntitlements.feature);
}

/** Grants a commercial feature to one workspace (an Enterprise contract on cloud), or revokes it. */
export async function setWorkspaceEntitlement(
  workspaceId: string,
  feature: EeFeature,
  grant: { expiresAt: Date | null; note: string; by: string } | null,
) {
  if (!grant) {
    await db()
      .delete(schema.workspaceEntitlements)
      .where(
        and(
          eq(schema.workspaceEntitlements.workspaceId, workspaceId),
          eq(schema.workspaceEntitlements.feature, feature),
        ),
      );
    return;
  }
  const row = { expiresAt: grant.expiresAt, note: grant.note || null, createdBy: grant.by };
  await db()
    .insert(schema.workspaceEntitlements)
    .values({ workspaceId, feature, ...row })
    .onConflictDoUpdate({
      target: [schema.workspaceEntitlements.workspaceId, schema.workspaceEntitlements.feature],
      set: row,
    });
}
