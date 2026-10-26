import Link from "next/link";
import type { ComponentProps } from "react";
import { ArrowRightIcon, ChevronRightIcon, ExternalLinkIcon } from "lucide-react";
import { cn } from "cn";

/**
 * Links in content, three kinds and no others (visual-alignment C8):
 * - `inline`: inside a sentence ("Upgrade", a docs link); takes the text's colour, underlined.
 * - `action`: a next step ("View candidates →", "See plans"); orange, underline on hover, an
 *   arrow (or the external-link mark when it opens a new tab).
 * - `more`: a card header's "View all ›"; muted, with a chevron.
 * A name that opens a record is just `font-medium hover:underline`; an action in a row is a
 * `Button`, never a text link.
 */
function TextLink({
  variant = "inline",
  external = false,
  arrow = variant !== "inline",
  className,
  children,
  ...props
}: ComponentProps<typeof Link> & {
  variant?: "inline" | "action" | "more";
  /** Opens in a new tab, with the external-link mark and its words for screen readers. */
  external?: boolean;
  /** `action` and `more` carry their arrow unless told not to. */
  arrow?: boolean;
}) {
  const Icon = external ? ExternalLinkIcon : variant === "more" ? ChevronRightIcon : ArrowRightIcon;
  return (
    <Link
      data-slot="text-link"
      {...(external && { target: "_blank", rel: "noreferrer" })}
      className={cn(
        "rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        variant === "inline" &&
          "underline decoration-current/40 underline-offset-4 hover:decoration-current",
        variant === "action" &&
          "inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline",
        variant === "more" &&
          "inline-flex items-center gap-0.5 text-sm text-muted-foreground hover:text-foreground",
        className,
      )}
      {...props}
    >
      {children}
      {(arrow || external) && <Icon className="size-4 shrink-0" aria-hidden />}
      {external && <span className="sr-only"> (opens in a new tab)</span>}
    </Link>
  );
}

export { TextLink };
