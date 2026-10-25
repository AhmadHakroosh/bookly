import type { Metadata } from "next";
import { loadEnv } from "@bookly/config";

/** Marketing-site constants for the platform host. */
export const SITE = {
  name: "Bookly",
  tagline: "A booking starts it. Bookly keeps it moving.",
  description:
    "A connected workspace for client work: booking pages, a briefing before each call, transcripts with consent, recaps, follow-ups and payment requests, with an open-source core you can run yourself.",
  github: "https://github.com/AhmadHakroosh/bookly",
  /** The legal entity behind the hosted service (contracts, invoices, legal pages). */
  operator: "Cloudeo Solutions, LLC",
  /**
   * Its postal address, from the environment so the repo carries no address. The legal pages print
   * it after the entity name, so a value that starts with the name loses that prefix.
   */
  operatorAddress: (process.env.OPERATOR_ADDRESS ?? "")
    .replace(/^\s*Cloudeo Solutions,? LLC,?\s*/i, "")
    .trim(),
  /** Who builds it (about page, footer credit). */
  maker: "Ahmad Hakroosh",
  supportEmail: process.env.SUPPORT_EMAIL ?? "support@bookly-app.io",
  /** Date the legal pages were last revised. */
  legalUpdated: "October 2, 2026",
  /** The brand line (canon): "Progress." is set in Bookly Orange. */
  brandLine: "People. Conversations. Progress.",
  /** Last meaningful change to the marketing pages (sitemap lastmod). */
  updated: "2026-10-25",
} as const;

export const siteUrl = () => loadEnv().APP_URL.replace(/\/$/, "");

/** A link in the header menus and the footer; `external` opens a new tab. */
export type SiteLink = { href: string; label: string; external?: boolean };
/** A mega-menu item: a title and the one line under it. */
export type MenuItem = SiteLink & { description: string; icon: MenuIcon };
export type MenuIcon =
  | "booking"
  | "briefing"
  | "recap"
  | "follow-up"
  | "payment"
  | "integrations"
  | "trust"
  | "compare"
  | "consultants"
  | "coaches"
  | "agencies"
  | "teams"
  | "hiring"
  | "programs"
  | "docs"
  | "start"
  | "api"
  | "self-host"
  | "changelog"
  | "press";
/** A header menu (concept-fidelity §6): groups of items and one featured card. */
export type Menu = {
  label: string;
  groups: { heading: string; items: MenuItem[] }[];
  featured: { eyebrow: string; title: string; body: string; href: string; cta: string };
};

/** The header: Product ▾ · Solutions ▾ · Pricing · Resources ▾, in that order. */
export const MENUS: { product: Menu; solutions: Menu; resources: Menu } = {
  product: {
    label: "Product",
    groups: [
      {
        heading: "The client journey",
        items: [
          {
            href: "/product#booking",
            label: "Booking",
            description: "Booking pages, event types and availability",
            icon: "booking",
          },
          {
            href: "/product#briefing",
            label: "Briefing",
            description: "Walk in knowing who, why and what happened last",
            icon: "briefing",
          },
          {
            href: "/product#recap",
            label: "Meeting recap",
            description: "Notes, transcript with consent, decisions and tasks",
            icon: "recap",
          },
          {
            href: "/product#follow-up",
            label: "Follow-up",
            description: "The next email, drafted from the recap",
            icon: "follow-up",
          },
          {
            href: "/product#payment",
            label: "Payment request",
            description: "Get paid through your own Stripe account",
            icon: "payment",
          },
        ],
      },
      {
        heading: "Platform",
        items: [
          {
            href: "/docs/integrations",
            label: "Integrations",
            description: "Google, Microsoft, Zoom, Stripe, HubSpot and more",
            icon: "integrations",
          },
          {
            href: "/trust",
            label: "Trust & ownership",
            description: "Consent, retention, export and self-hosting",
            icon: "trust",
          },
          {
            href: "/compare",
            label: "Compare",
            description: "Bookly next to the tools you know, honestly",
            icon: "compare",
          },
        ],
      },
    ],
    featured: {
      eyebrow: "Product",
      title: "One client. Every step connected.",
      body: "From the first booking to the paid invoice, every conversation, note and next step stays with the client.",
      href: "/product",
      cta: "Explore the product",
    },
  },
  solutions: {
    label: "Solutions",
    groups: [
      {
        heading: "Client work",
        items: [
          {
            href: "/solutions",
            label: "Consultants",
            description: "Turn expertise into progress",
            icon: "consultants",
          },
          {
            href: "/solutions/coaches",
            label: "Coaches",
            description: "Sessions, notes and packages in one place",
            icon: "coaches",
          },
          {
            href: "/solutions/agencies",
            label: "Agencies",
            description: "From discovery call to signed proposal",
            icon: "agencies",
          },
          {
            href: "/solutions/teams",
            label: "Teams",
            description: "One shared memory of every client",
            icon: "teams",
          },
        ],
      },
      {
        heading: "Selecting people",
        items: [
          {
            href: "/solutions/hiring",
            label: "Hiring",
            description: "Jobs and internships, reviewed fairly",
            icon: "hiring",
          },
          {
            href: "/solutions/programs",
            label: "Programs & cohorts",
            description: "Fellowships, accelerators and admissions",
            icon: "programs",
          },
        ],
      },
    ],
    featured: {
      eyebrow: "Hiring · Beta",
      title: "Every applicant heard. Every decision clear.",
      body: "Applications, independent reviews, interviews and decisions on the same platform as your client work. People decide; AI only summarises.",
      href: "/solutions/hiring",
      cta: "See hiring",
    },
  },
  resources: {
    label: "Resources",
    groups: [
      {
        heading: "Learn",
        items: [
          {
            href: "/resources",
            label: "Resources",
            description: "Guides, docs and tools in one place",
            icon: "start",
          },
          {
            href: "/docs",
            label: "Documentation",
            description: "How every part of Bookly works",
            icon: "docs",
          },
          {
            href: "/docs/api",
            label: "API reference",
            description: "REST API, webhooks and the OpenAPI spec",
            icon: "api",
          },
        ],
      },
      {
        heading: "More",
        items: [
          {
            href: "/docs/self-hosting",
            label: "Self-hosting",
            description: "Run Bookly with Docker Compose",
            icon: "self-host",
          },
          {
            href: "/changelog",
            label: "Changelog",
            description: "What shipped, release by release",
            icon: "changelog",
          },
          {
            href: "/press",
            label: "Brand and press",
            description: "Logos, colours and the press kit",
            icon: "press",
          },
        ],
      },
    ],
    featured: {
      eyebrow: "Open-source core",
      title: "Make Bookly your own.",
      body: "The core is AGPL-3.0: read every line, run it on your own server, or let us run it for you.",
      href: SITE.github,
      cta: "View on GitHub",
    },
  },
};

/** Footer columns (concept-fidelity §6, from the Sam site's footer). */
export const FOOTER: Record<string, SiteLink[]> = {
  Product: [
    { href: "/product", label: "Product overview" },
    { href: "/pricing", label: "Pricing" },
    { href: "/trust", label: "Trust & ownership" },
    { href: "/docs/integrations", label: "Integrations" },
    { href: "/docs/self-hosting", label: "Self-hosting" },
  ],
  Solutions: [
    { href: "/solutions", label: "Consultants" },
    { href: "/solutions/coaches", label: "Coaches" },
    { href: "/solutions/agencies", label: "Agencies" },
    { href: "/solutions/teams", label: "Teams" },
    { href: "/solutions/hiring", label: "Hiring" },
    { href: "/solutions/programs", label: "Programs & cohorts" },
  ],
  Compare: [
    { href: "/compare/calendly", label: "Bookly vs Calendly" },
    { href: "/compare/cal-com", label: "Bookly vs Cal.com" },
    { href: "/compare/savvycal", label: "Bookly vs SavvyCal" },
    { href: "/compare/greenhouse", label: "Bookly vs Greenhouse" },
    { href: "/compare/ashby", label: "Bookly vs Ashby" },
    { href: "/compare/submittable", label: "Bookly vs Submittable" },
    { href: "/compare", label: "All comparisons" },
  ],
  Company: [
    { href: "/about", label: "About" },
    { href: "/press", label: "Brand and press" },
    { href: "/contact", label: "Contact" },
  ],
  Resources: [
    { href: "/docs", label: "Docs" },
    { href: "/docs/api", label: "API" },
    { href: "/resources", label: "Guides" },
    { href: "/changelog", label: "Changelog" },
  ],
  Legal: [
    { href: "/terms", label: "Terms" },
    { href: "/privacy", label: "Privacy" },
    { href: "/dpa", label: "DPA" },
    { href: "/dpa#sub-processors", label: "Sub-processors" },
    { href: "/trust#ai", label: "AI transparency" },
    { href: "/privacy#cookies", label: "Cookies" },
    { href: "/security#reporting-a-vulnerability", label: "Security disclosure" },
  ],
};

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
  const image = title ? `${base}/og?title=${encodeURIComponent(title)}` : `${base}/og`;
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
      images: [{ url: image, width: 1200, height: 630, alt: full }],
    },
    twitter: { card: "summary_large_image", title: full, description, images: [image] },
  };
}
