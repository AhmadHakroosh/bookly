"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { ArrowRightIcon, ChevronDownIcon } from "lucide-react";
import type { Menu, SiteLink } from "../site";
import { MenuIcon } from "./menu-icon";

/**
 * The header's primary navigation: Product ▾ · Solutions ▾ · Pricing · Resources ▾. Each menu
 * is a disclosure (a button with aria-expanded controlling a panel of links), the pattern for
 * site navigation; not an ARIA menu, which would take arrow keys away from the links. Hover
 * opens it for pointer users, click and Enter for everyone; Escape, a click outside and a
 * navigation close it.
 */
export function MegaMenuNav({ menus, pricing }: { menus: Menu[]; pricing: SiteLink }) {
  const [open, setOpen] = useState<number | null>(null);
  const navRef = useRef<HTMLElement>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pathname = usePathname();
  const baseId = useId();

  // A navigation closes the panel (the link was followed).
  const [seenPath, setSeenPath] = useState(pathname);
  if (seenPath !== pathname) {
    setSeenPath(pathname);
    setOpen(null);
  }

  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const trigger = navRef.current?.querySelector<HTMLButtonElement>(
        `[data-menu-trigger="${open}"]`,
      );
      setOpen(null);
      trigger?.focus();
    };
    const onPointer = (e: PointerEvent) => {
      if (!navRef.current?.contains(e.target as Node)) setOpen(null);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  const hover = (i: number | null) => (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setOpen(i), i === null ? 160 : 60);
  };

  const trigger = (i: number) => {
    const m = menus[i]!;
    const expanded = open === i;
    return (
      <li key={m.label} onPointerEnter={hover(i)} onPointerLeave={hover(null)}>
        <button
          type="button"
          data-menu-trigger={i}
          aria-expanded={expanded}
          aria-controls={`${baseId}-${i}`}
          onClick={() => setOpen(expanded ? null : i)}
          className={`inline-flex h-9 items-center gap-1 rounded-md px-3 text-sm font-medium transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none ${expanded ? "text-foreground" : "text-foreground/80"}`}
        >
          {m.label}
          <ChevronDownIcon
            className={`size-3.5 transition-transform motion-reduce:transition-none ${expanded ? "rotate-180" : ""}`}
            aria-hidden
          />
        </button>
        <div
          id={`${baseId}-${i}`}
          hidden={!expanded}
          className="absolute inset-x-0 top-full z-50 px-4 pt-2"
        >
          <MenuPanel menu={m} onNavigate={() => setOpen(null)} />
        </div>
      </li>
    );
  };

  return (
    <nav ref={navRef} aria-label="Primary" className="hidden lg:block">
      <ul className="flex items-center gap-1">
        {trigger(0)}
        {trigger(1)}
        <li>
          <Link
            href={pricing.href}
            className="inline-flex h-9 items-center rounded-md px-3 text-sm font-medium text-foreground/80 transition-colors hover:text-foreground"
          >
            {pricing.label}
          </Link>
        </li>
        {trigger(2)}
      </ul>
    </nav>
  );
}

/** A menu's panel: two groups of title + one-line items, and the featured card. */
function MenuPanel({ menu, onNavigate }: { menu: Menu; onNavigate: () => void }) {
  return (
    <div className="mx-auto grid w-[min(100%,52rem)] animate-in grid-cols-[1fr_1fr_15rem] gap-6 rounded-2xl border bg-popover p-5 text-popover-foreground shadow-[0_24px_60px_-24px_rgb(28_28_28/0.25)] duration-150 fade-in-0 slide-in-from-top-1 motion-reduce:animate-none">
      {menu.groups.map((g) => (
        <div key={g.heading}>
          <p className="px-2 text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
            {g.heading}
          </p>
          <ul className="mt-2 space-y-0.5">
            {g.items.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  className="flex items-start gap-3 rounded-lg p-2 transition-colors hover:bg-muted focus-visible:bg-muted"
                >
                  <MenuIcon name={item.icon} />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">{item.label}</span>
                    <span className="block text-[0.8rem] leading-snug text-muted-foreground">
                      {item.description}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <FeaturedCard featured={menu.featured} onNavigate={onNavigate} />
    </div>
  );
}

export function FeaturedCard({
  featured: f,
  onNavigate,
}: {
  featured: Menu["featured"];
  onNavigate?: () => void;
}) {
  const external = f.href.startsWith("http");
  return (
    <Link
      href={f.href}
      onClick={onNavigate}
      target={external ? "_blank" : undefined}
      rel={external ? "noreferrer" : undefined}
      className="group flex flex-col justify-between rounded-xl bg-accent p-5 transition-colors hover:bg-[color-mix(in_oklch,var(--accent),var(--brand)_8%)]"
    >
      <span>
        <span className="block text-xs font-semibold tracking-[0.08em] text-primary uppercase">
          {f.eyebrow}
        </span>
        <span className="mt-2 block text-lg leading-snug font-bold tracking-tight text-balance">
          {f.title}
        </span>
        <span className="mt-2 block text-[0.8rem] leading-relaxed text-muted-foreground">
          {f.body}
        </span>
      </span>
      <span className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
        {f.cta}
        <ArrowRightIcon
          className="size-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
          aria-hidden
        />
      </span>
    </Link>
  );
}
