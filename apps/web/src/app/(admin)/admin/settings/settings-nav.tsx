"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type SettingsTab = { href: string; label: string };

/** One tab per settings concern; the layout decides which tabs exist (Payments is cloud-only). */
export function SettingsNav({ tabs }: { tabs: SettingsTab[] }) {
  const pathname = usePathname();
  const active = (href: string) =>
    href === "/admin/settings" ? pathname === href : pathname.startsWith(href);
  return (
    <nav aria-label="Settings" className="-mb-px flex gap-1 overflow-x-auto border-b text-sm">
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={active(t.href) ? "page" : undefined}
          className={`-mb-px border-b-2 px-3 py-2 whitespace-nowrap ${
            active(t.href)
              ? "border-foreground font-medium text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
