import { SITE, siteUrl } from "./site";

/** Inline JSON-LD. Data is ours (no user input), so the script body is safe to embed. */
export function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}

export function organizationLd() {
  const base = siteUrl();
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${base}/#organization`,
    name: SITE.name,
    url: base,
    logo: `${base}/logo-mark.png`,
    email: SITE.supportEmail,
    sameAs: [SITE.github],
  };
}

export function websiteLd() {
  const base = siteUrl();
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${base}/#website`,
    name: SITE.name,
    url: base,
    publisher: { "@id": `${base}/#organization` },
  };
}

export function softwareLd(prices: { name: string; priceMonthly: number }[]) {
  const base = siteUrl();
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: SITE.name,
    url: base,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    description: SITE.description,
    softwareHelp: `${base}/docs`,
    license: "https://www.gnu.org/licenses/agpl-3.0.html",
    offers: prices.map((p) => ({
      "@type": "Offer",
      name: p.name,
      price: p.priceMonthly,
      priceCurrency: "USD",
      url: `${base}/pricing`,
      ...(p.priceMonthly
        ? {
            priceSpecification: {
              "@type": "UnitPriceSpecification",
              price: p.priceMonthly,
              priceCurrency: "USD",
              billingIncrement: 1,
              unitCode: "MON",
            },
          }
        : {}),
    })),
  };
}

export function faqLd(items: [string, string][]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map(([q, a]) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: { "@type": "Answer", text: a },
    })),
  };
}

export function breadcrumbLd(trail: [string, string][]) {
  const base = siteUrl();
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [["Home", "/"], ...trail].map(([name, path], i) => ({
      "@type": "ListItem",
      position: i + 1,
      name,
      item: `${base}${path}`,
    })),
  };
}
