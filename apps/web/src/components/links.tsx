import Link from "next/link";
import { ArrowLeftIcon, ExternalLinkIcon } from "lucide-react";
import type { ReactNode } from "react";

/** "← Back" navigation with a real icon. */
export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground hover:underline"
    >
      <ArrowLeftIcon className="size-3.5" aria-hidden />
      {children}
    </Link>
  );
}

/** A link that opens in a new tab, marked with an icon and announced to screen readers. */
export function ExternalLink({
  href,
  children,
  className = "inline-flex items-center gap-1 text-sm underline underline-offset-4",
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className={className}>
      {children}
      <ExternalLinkIcon className="size-3.5 shrink-0 opacity-70" aria-hidden />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}
