import Link from "next/link";
import { GitHubIcon, Logo } from "@/components/brand/logo";
import { FOOTER, SITE } from "../site";

/**
 * The footer (concept-fidelity §6): the logo with the brand line, then Product, Solutions,
 * Compare, Company, Resources and Legal, then the operator and the open-core line.
 */
export function SiteFooter() {
  const [lead, last] = [SITE.brandLine.replace(/Progress\.$/, ""), "Progress."];
  return (
    <footer className="border-t bg-sidebar">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:grid-cols-3 lg:grid-cols-[1.3fr_repeat(6,1fr)] lg:gap-6">
        <div className="space-y-3 sm:col-span-3 lg:col-span-1">
          <Logo />
          <p className="max-w-[14rem] text-sm font-semibold">
            {lead}
            <span className="text-primary">{last}</span>
          </p>
          <p className="max-w-[16rem] text-xs leading-relaxed text-muted-foreground">
            Open-source core under AGPL-3.0. Run it yourself, or let us run it for you.
          </p>
          <a
            href={SITE.github}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <GitHubIcon className="size-3.5" />
            Source on GitHub
          </a>
        </div>
        {Object.entries(FOOTER).map(([group, links]) => (
          <nav key={group} aria-labelledby={`footer-${group}`}>
            <h2
              id={`footer-${group}`}
              className="text-xs font-semibold tracking-[0.08em] text-foreground uppercase"
            >
              {group}
            </h2>
            <ul className="mt-3 space-y-2 text-sm">
              {links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-muted-foreground hover:text-foreground">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-5 text-xs text-muted-foreground">
          <span>
            © {SITE.updated.slice(0, 4)} {SITE.operator}.
          </span>
          <a href={`mailto:${SITE.supportEmail}`} className="hover:text-foreground">
            {SITE.supportEmail}
          </a>
        </div>
      </div>
    </footer>
  );
}
