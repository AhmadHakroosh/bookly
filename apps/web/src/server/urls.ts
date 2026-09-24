import "server-only";
import { loadEnv } from "@bookly/config";
import { and, eq, isNotNull, schema } from "@bookly/db";
import { db } from "@/lib/db";
import { isCloud, tenantUrl } from "./platform";

type Ws = { id: string; slug: string };

const cache = new Map<string, { host: string | null; at: number }>();
const TTL = 30_000;

/**
 * The verified domain marked primary under Admin → Domains, or null. Cached in-process for
 * 30s; domain actions clear it, and `proxy.ts` keeps its own copy in `tenancy.ts`.
 */
export async function primaryDomain(workspaceId: string): Promise<string | null> {
  const hit = cache.get(workspaceId);
  if (hit && Date.now() - hit.at < TTL) return hit.host;
  const row = await db().query.workspaceDomains.findFirst({
    where: and(
      eq(schema.workspaceDomains.workspaceId, workspaceId),
      eq(schema.workspaceDomains.isPrimary, true),
      isNotNull(schema.workspaceDomains.verifiedAt),
    ),
    columns: { host: true },
  });
  const host = row?.host ?? null;
  cache.set(workspaceId, { host, at: Date.now() });
  return host;
}

export function invalidatePrimaryDomainCache() {
  cache.clear();
}

/**
 * Origin of the workspace's guest-facing pages. Cloud: the primary custom domain when one is
 * verified, else `<slug>.<ROOT_DOMAIN>`; self-host: APP_URL. No trailing slash.
 */
export function publicOrigin(ws: Pick<Ws, "slug">, primary: string | null): string {
  const env = loadEnv();
  const platformHost = new URL(env.APP_URL).host.toLowerCase();
  if (isCloud() && env.ROOT_DOMAIN && primary && primary !== platformHost) {
    const proto = env.APP_URL.startsWith("https") ? "https" : "http";
    return `${proto}://${primary}`;
  }
  return tenantUrl(ws.slug, "");
}

/** Absolute base for links guests receive: booking pages, manage links, waitlist, unsubscribe. */
export async function publicBaseUrl(ws: Ws): Promise<string> {
  return publicOrigin(ws, await primaryDomain(ws.id));
}

/**
 * Absolute base for links to the admin. Always the `<slug>.<ROOT_DOMAIN>` host in cloud mode:
 * the session cookie is scoped to the root domain, so a custom domain would ask to sign in again.
 */
export function adminBaseUrl(ws: Pick<Ws, "slug">): string {
  return tenantUrl(ws.slug, "");
}
