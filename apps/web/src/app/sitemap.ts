import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { loadEnv } from "@bookly/config";
import { listDocs } from "@/server/docs";
import { SITE } from "@/app/(platform)/platform/site";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  const env = loadEnv();
  if (env.TENANCY !== "multi") return [];
  const base = env.APP_URL.replace(/\/$/, "");
  const now = new Date(SITE.updated);
  const legal = new Date(`${SITE.legalUpdated} UTC`);
  const pages: MetadataRoute.Sitemap = [
    { url: `${base}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/pricing`, lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    { url: `${base}/about`, lastModified: now, changeFrequency: "yearly", priority: 0.5 },
    { url: `${base}/contact`, lastModified: now, changeFrequency: "yearly", priority: 0.5 },
    { url: `${base}/security`, lastModified: legal, changeFrequency: "yearly", priority: 0.5 },
    { url: `${base}/privacy`, lastModified: legal, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/terms`, lastModified: legal, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/changelog`, lastModified: now, changeFrequency: "weekly", priority: 0.6 },
    { url: `${base}/docs`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
  ];
  const docs = await listDocs();
  for (const d of docs)
    pages.push({
      url: `${base}/docs/${d.slug}`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.6,
    });
  return pages;
}
