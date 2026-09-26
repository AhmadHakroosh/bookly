import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { headers } from "next/headers";
import { isCloud, platformHost } from "@/server/platform";
import { publicBaseUrl } from "@/server/urls";
import { getCurrentWorkspace } from "@/server/workspace";
import { loadEnv } from "@bookly/config";

/**
 * Two robots files: the marketing host (cloud) points at the marketing sitemap; a workspace
 * host (a tenant subdomain, a custom domain, or a self-hosted install) points at its own,
 * so a workspace's booking pages are never attributed to the platform site, and vice versa.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  await connection();
  const h = await headers();
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "")
    .split(",")[0]!
    .trim()
    .toLowerCase();
  if (isCloud() && host === platformHost()) {
    const base = loadEnv().APP_URL.replace(/\/$/, "");
    return {
      rules: [
        { userAgent: "*", allow: "/", disallow: ["/admin", "/console", "/api", "/workspaces"] },
      ],
      sitemap: `${base}/sitemap.xml`,
      host: base,
    };
  }
  const ws = await getCurrentWorkspace();
  if (!ws) return { rules: { userAgent: "*", disallow: "/" } };
  const base = await publicBaseUrl(ws);
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Personal links (manage, waitlist, unsubscribe) and the admin are never worth indexing.
        disallow: [
          "/admin",
          "/api",
          "/booking/",
          "/waitlist/",
          "/unsubscribe/",
          "/meet/",
          "/login",
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
