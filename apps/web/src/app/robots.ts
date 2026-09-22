import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { loadEnv } from "@bookly/config";

/** Marketing host in cloud mode is indexable; tenant hosts and self-host installs stay private. */
export default async function robots(): Promise<MetadataRoute.Robots> {
  await connection();
  const env = loadEnv();
  if (env.TENANCY !== "multi") return { rules: { userAgent: "*", disallow: "/admin" } };
  const base = env.APP_URL.replace(/\/$/, "");
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: ["/admin", "/console", "/api", "/workspaces"] },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
