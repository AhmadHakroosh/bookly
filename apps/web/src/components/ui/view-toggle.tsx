"use client";

import Link from "next/link";
import type { ComponentType, SVGProps } from "react";
import { cn } from "cn";

export type ViewToggleItem = {
  key: string;
  /** The view's name: the accessible label and the tooltip. */
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  active: boolean;
  /** A link when the view is an address; otherwise `onClick`. */
  href?: string;
  onClick?: () => void;
  /** Shown but off (a plan without it), with why. */
  disabled?: string;
};

/**
 * List, board or calendar: icon buttons in one bordered 32 px group, as tall as the pills and small
 * buttons beside it (`ui mocks.png` 05), the
 * current one Peach. One component for every page that switches how a list is shown.
 */
function ViewToggle({
  items,
  label = "View",
  className,
}: {
  items: ViewToggleItem[];
  label?: string;
  className?: string;
}) {
  const cls = (active: boolean) =>
    cn(
      "inline-flex size-7 items-center justify-center rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&_svg]:size-4",
      active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground",
    );
  return (
    <nav
      aria-label={label}
      data-slot="view-toggle"
      className={cn("inline-flex h-8 items-center rounded-lg border bg-card p-px", className)}
    >
      {items.map(({ key, label: name, icon: Icon, active, href, onClick, disabled }) =>
        disabled ? (
          <span
            key={key}
            title={disabled}
            className="inline-flex size-7 cursor-not-allowed items-center justify-center rounded-md text-muted-foreground/50 [&_svg]:size-4"
          >
            <Icon aria-hidden />
            <span className="sr-only">
              {name} ({disabled})
            </span>
          </span>
        ) : href ? (
          <Link
            key={key}
            href={href}
            onClick={onClick}
            aria-current={active ? "page" : undefined}
            aria-label={name}
            title={name}
            className={cls(active)}
          >
            <Icon aria-hidden />
          </Link>
        ) : (
          <button
            key={key}
            type="button"
            aria-pressed={active}
            aria-label={name}
            title={name}
            onClick={onClick}
            className={cls(active)}
          >
            <Icon aria-hidden />
          </button>
        ),
      )}
    </nav>
  );
}

export { ViewToggle };
