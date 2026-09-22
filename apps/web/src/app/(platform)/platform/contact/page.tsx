import type { Metadata } from "next";
import {
  BugIcon,
  MailIcon,
  MessageSquareIcon,
  ShieldAlertIcon,
  type LucideIcon,
} from "lucide-react";
import { pageMetadata, SITE } from "../site";

export const metadata: Metadata = pageMetadata({
  title: "Contact",
  description: "Support, sales questions, bug reports and security disclosures for Bookly.",
  path: "/contact",
});

const WAYS: [LucideIcon, string, string, string, string][] = [
  [
    MailIcon,
    "Support and sales",
    "Questions about plans, billing, migrating from another tool, or anything that is not working.",
    `mailto:${SITE.supportEmail}`,
    SITE.supportEmail,
  ],
  [
    BugIcon,
    "Bug reports and feature requests",
    "Bookly is developed in the open. Issues are triaged on GitHub, and the changelog shows what shipped.",
    `${SITE.github}/issues/new/choose`,
    "Open an issue",
  ],
  [
    MessageSquareIcon,
    "Self-hosting help",
    "Read the install guide first; it covers Docker, env vars, domains and upgrades. Then ask on GitHub Discussions.",
    `${SITE.github}/discussions`,
    "GitHub Discussions",
  ],
  [
    ShieldAlertIcon,
    "Security disclosures",
    "Found a vulnerability? Email us directly, not on the public tracker. We acknowledge within two business days.",
    `mailto:${SITE.supportEmail}?subject=Security%20disclosure`,
    "Report privately",
  ],
];

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-14 md:py-20">
      <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Contact</h1>
      <p className="mt-3 max-w-2xl text-lg text-muted-foreground">
        A real person reads every message. Expect a reply within one business day; usually much
        sooner.
      </p>
      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        {WAYS.map(([Icon, title, text, href, label]) => (
          <a
            key={title}
            href={href}
            target={href.startsWith("http") ? "_blank" : undefined}
            rel={href.startsWith("http") ? "noreferrer" : undefined}
            className="group rounded-2xl border p-6 transition-colors hover:bg-muted/40"
          >
            <Icon className="size-5 text-(--brand)" aria-hidden />
            <h2 className="mt-3 font-semibold tracking-tight">{title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{text}</p>
            <p className="mt-3 text-sm underline underline-offset-4 group-hover:text-(--brand)">
              {label}
            </p>
          </a>
        ))}
      </div>
      <p className="mt-10 text-sm text-muted-foreground">
        Bookly is operated by {SITE.operator}. Legal notices go to {SITE.supportEmail}.
      </p>
    </div>
  );
}
