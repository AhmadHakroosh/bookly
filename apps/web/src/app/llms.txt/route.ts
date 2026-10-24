import { connection } from "next/server";
import { headers } from "next/headers";
import { listDocs } from "@/server/docs";
import { isCloud, platformHost } from "@/server/platform";
import { SITE, siteUrl } from "@/app/(platform)/platform/site";

/**
 * llms.txt (https://llmstxt.org): a Markdown map of the marketing site and the manual for AI
 * crawlers and agents. Only the platform host has one; workspace hosts answer 404.
 */
export async function GET() {
  await connection();
  const h = await headers();
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "")
    .split(",")[0]!
    .trim()
    .toLowerCase();
  if (!isCloud() || host !== platformHost()) return new Response("Not found", { status: 404 });
  const base = siteUrl();
  const docs = await listDocs();
  const lines = [
    `# ${SITE.name}`,
    "",
    `> ${SITE.description}`,
    "",
    "Bookly is scheduling software with an open-source core (AGPL-3.0): hosts publish booking pages, guests pick a time, calendars stay in sync, and every meeting can be briefed, transcribed with consent and followed up. It runs as a hosted service at bookly-app.io and can be self-hosted from the public repository.",
    "",
    "## Product",
    "",
    `- [Home](${base}/): what Bookly does, with the main flows shown`,
    `- [Product](${base}/product): the client journey, from booking to briefing, recap, follow-up and payment`,
    `- [Solutions](${base}/solutions): Bookly for consultants, coaches, agencies, teams, hiring and programs`,
    `- [Pricing](${base}/pricing): Free, Pro and Team plans and what each includes`,
    `- [Trust & ownership](${base}/trust): consent, retention, export, optional AI and self-hosting`,
    `- [Compare](${base}/compare): Bookly next to Calendly, Cal.com, SavvyCal, Greenhouse, Ashby and Submittable`,
    `- [Resources](${base}/resources): guides, docs search, API reference and changelog`,
    `- [Changelog](${base}/changelog): release notes`,
    `- [Security](${base}/security): how data and connections are protected`,
    `- [About](${base}/about): who builds Bookly and why`,
    "",
    "## Documentation",
    "",
    ...docs.map((d) => `- [${d.title}](${base}/docs/${d.slug}): ${d.description}`),
    "",
    "## Developers",
    "",
    `- [OpenAPI document](${base}/api/v1/openapi.json): the public REST API, machine-readable`,
    `- [Source code](${SITE.github}): the repository, self-hosting guide and issue tracker`,
    "",
    "## Legal",
    "",
    `- [Privacy policy](${base}/privacy)`,
    `- [Terms of service](${base}/terms)`,
    `- [Data processing agreement](${base}/dpa)`,
    "",
  ];
  return new Response(lines.join("\n"), {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "cache-control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
}
