import { cacheLife, cacheTag } from "next/cache";
import { headers } from "next/headers";
import { cache } from "react";
import { eq, schema } from "@bookly/db";
import type { Workspace } from "@bookly/db/schema";
import { db } from "@/lib/db";
import { workspaceTag } from "./cache";
import { resolveWorkspaceByHost } from "./tenancy";

export const WORKSPACE_HEADER = "x-bookly-workspace";

/**
 * Current workspace. Normally resolved by proxy.ts and passed in a request header; falls
 * back to resolving by host for routes the proxy matcher skips (feeds, sitemap, robots…).
 * Null before setup or for unknown hosts.
 */
export const getCurrentWorkspace = cache(async (): Promise<Workspace | null> => {
  const h = await headers();
  let id = h.get(WORKSPACE_HEADER);
  if (!id) id = (await resolveWorkspaceByHost(h.get("host")))?.workspaceId ?? null;
  if (!id) return null;
  return getWorkspaceById(id);
});

/** Cached per workspace; refreshed by `refreshWorkspace()` after settings changes. */
export async function getWorkspaceById(id: string): Promise<Workspace | null> {
  "use cache";
  cacheTag(workspaceTag(id));
  cacheLife("hours");
  return (await db().query.workspaces.findFirst({ where: eq(schema.workspaces.id, id) })) ?? null;
}

/** True when no workspace exists yet (first run) → show the setup wizard. */
export const needsSetup = cache(async () => {
  const first = await db().query.workspaces.findFirst({ columns: { id: true } });
  return !first;
});
