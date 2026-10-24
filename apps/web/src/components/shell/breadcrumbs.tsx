"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment } from "react";
import { ChevronRightIcon } from "lucide-react";
import { trail, type NavOptions } from "./nav";

/**
 * Where you are, in the top bar: the nav group, the page, and the sub-page ("Workspace ›
 * Settings › Branding"). The current page is the last crumb and is not a link; below it (one
 * contact, one booking) the page's own title names the thing.
 */
export function Breadcrumbs({ nav, className }: { nav: NavOptions; className?: string }) {
  const crumbs = trail(usePathname(), nav);
  if (!crumbs.length) return null;
  return (
    <nav aria-label="Breadcrumb" className={className}>
      <ol className="flex min-w-0 items-center gap-1.5 text-sm">
        {crumbs.map((c, i) => {
          return (
            <Fragment key={`${c.label}-${i}`}>
              {i > 0 && (
                <li aria-hidden className="text-muted-foreground/70">
                  <ChevronRightIcon className="size-3.5" />
                </li>
              )}
              <li className="min-w-0 truncate">
                {c.current ? (
                  <span aria-current="page" className="font-medium text-foreground">
                    {c.label}
                  </span>
                ) : c.href ? (
                  <Link href={c.href} className="text-muted-foreground hover:text-foreground">
                    {c.label}
                  </Link>
                ) : (
                  <span className="text-muted-foreground">{c.label}</span>
                )}
              </li>
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
