import "server-only";
import dns from "node:dns/promises";
import { and, eq, schema } from "@bookly/db";
import { loadEnv } from "@bookly/config";
import { db } from "@/lib/db";

export const VERIFY_PREFIX = "_bookly";

export function normalizeHost(input: string): string | null {
  let h = input.trim().toLowerCase();
  h = h
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/\.$/, "");
  if (
    !/^(?=.{1,253}$)([a-z0-9-]{1,63}\.)+[a-z]{2,63}$/.test(h) &&
    !/^localhost(:\d+)?$/.test(h) &&
    !/^[a-z0-9.-]+:\d+$/.test(h)
  )
    return null;
  return h;
}

/** Where the customer's DNS should point. */
export function dnsTarget() {
  const env = loadEnv();
  return env.ROOT_DOMAIN ?? new URL(env.APP_URL).host;
}

export async function listDomains(workspaceId: string) {
  return db()
    .select()
    .from(schema.workspaceDomains)
    .where(eq(schema.workspaceDomains.workspaceId, workspaceId))
    .orderBy(schema.workspaceDomains.createdAt);
}

/**
 * Whether we should serve (and obtain a certificate for) this hostname.
 * Single-tenant: the APP_URL host plus any host the owner listed under Domains.
 * Multi-tenant: root-domain subdomains plus verified custom domains.
 */
export async function isServableHost(host: string) {
  const h = host.toLowerCase();
  const env = loadEnv();
  if (h === new URL(env.APP_URL).host.toLowerCase()) return true;
  if (env.ROOT_DOMAIN && (h === env.ROOT_DOMAIN || h.endsWith(`.${env.ROOT_DOMAIN}`))) return true;
  const row = await db().query.workspaceDomains.findFirst({
    where: eq(schema.workspaceDomains.host, h),
    columns: { verifiedAt: true },
  });
  if (!row) return false;
  return env.TENANCY === "single" ? true : !!row.verifiedAt;
}

export type VerifyResult = { ok: boolean; txt: boolean; pointsHere: boolean; error?: string };

/** Checks the TXT ownership record and that the host resolves to this deployment. */
export async function verifyDomain(workspaceId: string, domainId: string): Promise<VerifyResult> {
  const row = await db().query.workspaceDomains.findFirst({
    where: and(
      eq(schema.workspaceDomains.id, domainId),
      eq(schema.workspaceDomains.workspaceId, workspaceId),
    ),
  });
  if (!row) return { ok: false, txt: false, pointsHere: false, error: "Domain not found" };
  const host = row.host.split(":")[0]!;
  const target = dnsTarget().split(":")[0]!;
  let txt = false;
  let pointsHere = false;
  let error: string | undefined;
  try {
    const records = await dns.resolveTxt(`${VERIFY_PREFIX}.${host}`).catch(() => [] as string[][]);
    txt = records.some((r) => r.join("") === row.verificationToken);
    const cname = await dns.resolveCname(host).catch(() => [] as string[]);
    if (cname.some((c) => c.replace(/\.$/, "").toLowerCase() === target)) pointsHere = true;
    else {
      const [a, ta] = await Promise.all([
        dns.resolve4(host).catch(() => [] as string[]),
        dns.resolve4(target).catch(() => [] as string[]),
      ]);
      pointsHere = a.length > 0 && a.some((ip) => ta.includes(ip));
    }
  } catch (e) {
    error = (e as Error).message;
  }
  const ok = txt && pointsHere;
  await db()
    .update(schema.workspaceDomains)
    .set({
      verifiedAt: ok ? (row.verifiedAt ?? new Date()) : null,
      lastCheckedAt: new Date(),
      lastError: ok
        ? null
        : (error ?? (!txt ? "TXT record not found" : "Host does not point to this server")),
    })
    .where(eq(schema.workspaceDomains.id, row.id));
  return { ok, txt, pointsHere, error };
}
