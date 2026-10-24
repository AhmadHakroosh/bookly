"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ChevronDownIcon, MenuIcon as MenuLines } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Logo } from "@/components/brand/logo";
import type { Menu, SiteLink } from "../site";
import { MenuIcon } from "./menu-icon";

/**
 * The header under the lg breakpoint: a sheet with the same menus as expandable sections, then
 * the session links (streamed in by the server) and Start free. Closes on navigation.
 */
export function MobileMenu({
  menus,
  pricing,
  session,
}: {
  menus: Menu[];
  pricing: SiteLink;
  session: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const [seenPath, setSeenPath] = useState(pathname);
  if (seenPath !== pathname) {
    setSeenPath(pathname);
    setOpen(false);
  }
  const close = () => setOpen(false);
  const section = (m: Menu) => (
    <details key={m.label} className="group border-b">
      <summary className="flex cursor-pointer list-none items-center justify-between py-3 text-base font-semibold [&::-webkit-details-marker]:hidden">
        {m.label}
        <ChevronDownIcon
          className="size-4 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none"
          aria-hidden
        />
      </summary>
      <ul className="space-y-1 pb-3">
        {m.groups
          .flatMap((g) => g.items)
          .map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={close}
                className="flex items-center gap-3 rounded-lg p-2 hover:bg-muted"
              >
                <MenuIcon name={item.icon} className="size-8" />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{item.label}</span>
                  <span className="block text-xs text-muted-foreground">{item.description}</span>
                </span>
              </Link>
            </li>
          ))}
      </ul>
    </details>
  );
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={<Button variant="ghost" size="icon" className="lg:hidden" aria-label="Menu" />}
      >
        <MenuLines />
      </SheetTrigger>
      <SheetContent side="right" className="w-[min(22rem,100%)] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            <Logo />
            <span className="sr-only">Menu</span>
          </SheetTitle>
        </SheetHeader>
        <nav aria-label="Mobile" className="flex flex-col px-4 pb-6">
          {section(menus[0]!)}
          {section(menus[1]!)}
          <Link
            href={pricing.href}
            onClick={close}
            className="border-b py-3 text-base font-semibold"
          >
            {pricing.label}
          </Link>
          {section(menus[2]!)}
          <div className="mt-4 flex flex-col gap-1 text-base">{session}</div>
          <Button
            variant="ink"
            size="lg"
            className="mt-4"
            nativeButton={false}
            render={<Link href="/signup" onClick={close} />}
          >
            Start free
          </Button>
        </nav>
      </SheetContent>
    </Sheet>
  );
}
