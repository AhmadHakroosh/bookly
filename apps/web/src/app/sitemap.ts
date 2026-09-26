import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { loadEnv } from "@bookly/config";
import { headers } from "next/headers";
import type { Workspace } from "@bookly/db/schema";
import { listDocs } from "@/server/docs";
import { isCloud, platformHost } from "@/server/platform";
import { listRoutingForms } from "@/server/routing";
import { listEventTypes, listProfiles } from "@/server/scheduling";
import { publicBaseUrl } from "@/server/urls";
import { getCurrentWorkspace } from "@/server/workspace";
import { latestReleaseDate } from "@/server/release";
import { SITE } from "@/app/(platform)/platform/site";

/** The marketing site's pages (cloud platform host). */
async function marketingSitemap(base: string): Promise<MetadataRoute.Sitemap> {
  const legal = new Date(`${SITE.legalUpdated} UTC`);
  // Pages that change with releases carry the last release date; the rest carry no lastmod
  // rather than a made-up one, which search engines learn to ignore.
  const released = (await latestReleaseDate()) ?? undefined;
  const pages: MetadataRoute.Sitemap = [
    { url: `${base}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/pricing`, changeFrequency: "monthly", priority: 0.9 },
    { url: `${base}/about`, changeFrequency: "yearly", priority: 0.5 },
    { url: `${base}/contact`, changeFrequency: "yearly", priority: 0.5 },
    { url: `${base}/security`, lastModified: legal, changeFrequency: "yearly", priority: 0.5 },
    { url: `${base}/privacy`, lastModified: legal, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/terms`, lastModified: legal, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/dpa`, lastModified: legal, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/changelog`, lastModified: released, changeFrequency: "weekly", priority: 0.6 },
    { url: `${base}/docs`, lastModified: released, changeFrequency: "weekly", priority: 0.7 },
  ];
  for (const d of await listDocs())
    pages.push({
      url: `${base}/docs/${d.slug}`,
      lastModified: released,
      changeFrequency: "monthly",
      priority: 0.6,
    });
  return pages;
}

/** A workspace's public pages: the home, every host's page, visible event types, routing forms. */
async function workspaceSitemap(ws: Workspace): Promise<MetadataRoute.Sitemap> {
  const base = await publicBaseUrl(ws);
  const [profiles, events, forms] = await Promise.all([
    listProfiles(ws.id),
    listEventTypes(ws.id),
    listRoutingForms(ws.id),
  ]);
  const byUser = new Map(profiles.map((p) => [p.userId, p]));
  const pages: MetadataRoute.Sitemap = [
    { url: `${base}/`, lastModified: ws.updatedAt, changeFrequency: "weekly", priority: 1 },
  ];
  for (const p of profiles)
    pages.push({
      url: `${base}/${p.username}`,
      lastModified: p.updatedAt,
      changeFrequency: "weekly",
      priority: 0.9,
    });
  for (const e of events) {
    const host = byUser.get(e.userId);
    if (host)
      pages.push({
        url: `${base}/${host.username}/${e.slug}`,
        lastModified: e.updatedAt,
        changeFrequency: "weekly",
        priority: 0.8,
      });
  }
  for (const f of forms)
    pages.push({ url: `${base}/r/${f.slug}`, changeFrequency: "monthly", priority: 0.6 });
  return pages;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  const h = await headers();
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "")
    .split(",")[0]!
    .trim()
    .toLowerCase();
  if (isCloud() && host === platformHost())
    return marketingSitemap(loadEnv().APP_URL.replace(/\/$/, ""));
  const ws = await getCurrentWorkspace();
  return ws ? workspaceSitemap(ws) : [];
}
