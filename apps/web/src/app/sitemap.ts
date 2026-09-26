import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { loadEnv } from "@bookly/config";
import { listDocs } from "@/server/docs";
import { latestReleaseDate } from "@/server/release";
import { SITE } from "@/app/(platform)/platform/site";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  const env = loadEnv();
  if (env.TENANCY !== "multi") return [];
  const base = env.APP_URL.replace(/\/$/, "");
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
  const docs = await listDocs();
  for (const d of docs)
    pages.push({
      url: `${base}/docs/${d.slug}`,
      lastModified: released,
      changeFrequency: "monthly",
      priority: 0.6,
    });
  return pages;
}
