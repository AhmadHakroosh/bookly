import { and, eq, isNotNull, schema } from "@bookly/db";
import { loadEnv } from "@bookly/config";
import { db } from "@/lib/db";

type Resolved = { workspaceId: string; primaryHost: string | null } | null;

const cache = new Map<string, { value: Resolved; at: number }>();
// Positive hits are cached for 30s. Misses only 2s: the proxy bundle has its own module
// instance, so an in-process invalidation from a server action cannot reach it.
const TTL_HIT = 30_000;
const TTL_MISS = 2_000;

/**
 * Host → workspace. Single-tenant: the only workspace. Multi-tenant: `<slug>.<ROOT_DOMAIN>`
 * subdomain or a verified custom domain from `workspace_domains`.
 * Cached in-process for 30s; a Redis-backed cache slots in here later.
 */
export async function resolveWorkspaceByHost(
  hostHeader: string | null,
  opts: { fresh?: boolean } = {},
): Promise<Resolved> {
  const env = loadEnv();
  const host = (hostHeader ?? "").toLowerCase();
  const key = env.TENANCY === "single" ? "*" : host;
  const hit = opts.fresh ? undefined : cache.get(key);
  if (hit && Date.now() - hit.at < (hit.value ? TTL_HIT : TTL_MISS)) return hit.value;

  let value: Resolved = null;
  if (env.TENANCY === "single") {
    const workspace = await db().query.workspaces.findFirst({ columns: { id: true } });
    value = workspace ? { workspaceId: workspace.id, primaryHost: null } : null;
  } else if (host) {
    const domain = await db().query.workspaceDomains.findFirst({
      where: and(
        eq(schema.workspaceDomains.host, host),
        isNotNull(schema.workspaceDomains.verifiedAt),
      ),
      columns: { workspaceId: true },
    });
    let workspaceId = domain?.workspaceId ?? null;
    if (!workspaceId && env.ROOT_DOMAIN && host.endsWith(`.${env.ROOT_DOMAIN}`)) {
      const slug = host.slice(0, -(env.ROOT_DOMAIN.length + 1));
      const workspace = await db().query.workspaces.findFirst({
        where: eq(schema.workspaces.slug, slug),
        columns: { id: true },
      });
      workspaceId = workspace?.id ?? null;
    }
    if (workspaceId) {
      // The verified domain marked primary: guest pages on any other host redirect to it.
      const primary = await db().query.workspaceDomains.findFirst({
        where: and(
          eq(schema.workspaceDomains.workspaceId, workspaceId),
          eq(schema.workspaceDomains.isPrimary, true),
          isNotNull(schema.workspaceDomains.verifiedAt),
        ),
        columns: { host: true },
      });
      value = { workspaceId, primaryHost: primary?.host ?? null };
    }
  }
  cache.set(key, { value, at: Date.now() });
  return value;
}

export function invalidateHostCache() {
  cache.clear();
}
