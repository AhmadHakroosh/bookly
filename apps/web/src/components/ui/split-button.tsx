"use client";

import Link from "next/link";
import type { ComponentType, ReactNode, SVGProps } from "react";
import { ChevronDownIcon } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type SplitItem = {
  label: string;
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
  href?: string;
  onSelect?: () => void;
};

/**
 * The page header's primary action with a menu, as `app ui.png` draws "+ Create ▾" (booking,
 * contact, task, event type, message). With `href` or `onClick` it splits: the main part does
 * the most common thing and the chevron lists the rest. Without either it is one button that
 * opens the menu. Ink by default; one per page.
 */
function SplitButton({
  children,
  href,
  onClick,
  items,
  menuLabel,
  variant = "ink",
  className,
}: {
  children: ReactNode;
  /** The main part: a link, or a click handler. */
  href?: string;
  onClick?: () => void;
  items: SplitItem[];
  /** Names the chevron of a split button for screen readers: "More things to create". */
  menuLabel?: string;
  variant?: "ink" | "default";
  className?: string;
}) {
  const menu = (
    <DropdownMenuContent align="end" className="w-52">
      {items.map((it) => (
        <DropdownMenuItem
          key={it.label}
          onClick={it.onSelect}
          {...(it.href ? { render: <Link href={it.href} /> } : {})}
        >
          {it.icon && <it.icon className="size-4" aria-hidden />}
          {it.label}
        </DropdownMenuItem>
      ))}
    </DropdownMenuContent>
  );
  if (!href && !onClick)
    return (
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant={variant} className={className} />}>
          {children}
          <ChevronDownIcon data-icon="inline-end" aria-hidden />
        </DropdownMenuTrigger>
        {menu}
      </DropdownMenu>
    );
  return (
    <div data-slot="button-group" className={cn("flex", className)}>
      <Button
        variant={variant}
        className="rounded-e-none"
        onClick={onClick}
        {...(href ? { nativeButton: false, render: <Link href={href} /> } : {})}
      >
        {children}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant={variant}
              size="icon"
              aria-label={menuLabel}
              className="rounded-s-none border-s border-s-current/20"
            />
          }
        >
          <ChevronDownIcon />
        </DropdownMenuTrigger>
        {menu}
      </DropdownMenu>
    </div>
  );
}

export { SplitButton };
