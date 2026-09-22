import "server-only";
import { headers } from "next/headers";
import { loadEnv } from "@bookly/config";
import { eq, schema } from "@bookly/db";
import { db } from "@/lib/db";

export const isCloud = () => loadEnv().TENANCY === "multi";

/** Host of APP_URL: the platform site (marketing, sign-up, console) in cloud mode. */
export function platformHost() {
  return new URL(loadEnv().APP_URL).host.toLowerCase();
}

/** True when this request targets the platform host in cloud mode. */
export async function onPlatformHost() {
  if (!isCloud()) return false;
  const hs = await headers();
  // X-Forwarded-Host carries the real host on internal renders (server-action redirects).
  const h = (hs.get("x-forwarded-host") ?? hs.get("host") ?? "")
    .split(",")[0]!
    .trim()
    .toLowerCase();
  return h === platformHost();
}

/** Public URL of a tenant: `<slug>.<ROOT_DOMAIN>` (falls back to APP_URL in single mode). */
export function tenantUrl(slug: string, path = "/admin") {
  const env = loadEnv();
  if (!isCloud() || !env.ROOT_DOMAIN) return `${env.APP_URL.replace(/\/$/, "")}${path}`;
  const proto = env.APP_URL.startsWith("https") ? "https" : "http";
  return `${proto}://${slug}.${env.ROOT_DOMAIN}${path}`;
}

export function isPlatformAdmin(email: string | null | undefined) {
  if (!email) return false;
  return loadEnv()
    .PLATFORM_ADMIN_EMAILS.split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.toLowerCase());
}

export type UserWorkspace = {
  id: string;
  name: string;
  slug: string;
  role: string;
  plan: string;
  suspended: boolean;
  url: string;
};

/** Every workspace the user belongs to, with the URL of its admin. */
export async function listUserWorkspaces(userId: string): Promise<UserWorkspace[]> {
  const rows = await db()
    .select({ ws: schema.workspaces, role: schema.members.role })
    .from(schema.members)
    .innerJoin(
      schema.workspaces,
      eq(schema.workspaces.organizationId, schema.members.organizationId),
    )
    .where(eq(schema.members.userId, userId))
    .orderBy(schema.workspaces.name);
  return rows.map(({ ws, role }) => ({
    id: ws.id,
    name: ws.name,
    slug: ws.slug,
    role,
    plan: ws.plan,
    suspended: !!ws.suspendedAt,
    url: tenantUrl(ws.slug),
  }));
}

/** Absolute URL of the platform host (landing, chooser, sign-up) in cloud mode. */
export function platformUrl(path = "/") {
  return `${loadEnv().APP_URL.replace(/\/$/, "")}${path}`;
}
