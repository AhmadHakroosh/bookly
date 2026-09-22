import type { Metadata } from "next";
import { loadEnv } from "@bookly/config";

/** Marketing-site constants for the platform host. */
export const SITE = {
  name: "Bookly",
  tagline: "The meeting is booked. Bookly handles the rest.",
  description:
    "Open-source scheduling that briefs you before each call, transcribes it with consent, and turns every meeting into tasks, follow-ups and relationships.",
  github: "https://github.com/AhmadHakroosh/bookly",
  operator: "Ahmad Hakroosh",
  supportEmail: process.env.SUPPORT_EMAIL ?? "hello@ahmadhakroosh.com",
  /** Date the legal pages were last revised. */
  legalUpdated: "September 23, 2026",
  /** Last meaningful change to the marketing pages (sitemap lastmod). */
  updated: "2026-09-22",
} as const;

export const siteUrl = () => loadEnv().APP_URL.replace(/\/$/, "");

export const NAV = [
  { href: "/#features", label: "Features" },
  { href: "/pricing", label: "Pricing" },
  { href: "/docs", label: "Docs", external: true },
  { href: "/changelog", label: "Changelog" },
] as const;

export const FOOTER = {
  Product: [
    { href: "/#features", label: "Features" },
    { href: "/#compare", label: "Why Bookly" },
    { href: "/pricing", label: "Pricing" },
    { href: "/changelog", label: "Changelog" },
    { href: "/docs", label: "Documentation", external: true },
  ],
  "Self-host": [
    { href: SITE.github, label: "GitHub", external: true },
    { href: "/docs/self-hosting", label: "Install guide", external: true },
    { href: "/docs/api", label: "API reference", external: true },
    { href: `${SITE.github}/issues`, label: "Report an issue", external: true },
  ],
  Company: [
    { href: "/about", label: "About" },
    { href: "/contact", label: "Contact" },
    { href: "/security", label: "Security" },
  ],
  Legal: [
    { href: "/privacy", label: "Privacy policy" },
    { href: "/terms", label: "Terms of service" },
  ],
} as const;

/**
 * Full social metadata for a marketing page. Set per page rather than in the layout: an
 * `openGraph` block on the layout makes Next resolve it per request, which blocks prerendering
 * of the console's dynamic routes that share the layout.
 */
export function pageMetadata({
  title,
  description = SITE.description,
  path = "/",
  absoluteTitle,
}: {
  title?: string;
  description?: string;
  path?: string;
  absoluteTitle?: string;
}): Metadata {
  const base = siteUrl();
  const full =
    absoluteTitle ?? (title ? `${title} — ${SITE.name}` : `${SITE.name} — ${SITE.tagline}`);
  return {
    title: absoluteTitle ? { absolute: absoluteTitle } : title,
    description,
    alternates: { canonical: `${base}${path}` },
    openGraph: {
      type: "website",
      siteName: SITE.name,
      url: `${base}${path}`,
      title: full,
      description,
      locale: "en_US",
      images: [{ url: `${base}/og`, width: 1200, height: 630, alt: full }],
    },
    twitter: { card: "summary_large_image", title: full, description, images: [`${base}/og`] },
  };
}
