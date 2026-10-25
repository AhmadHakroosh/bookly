"use client";

import { usePathname } from "next/navigation";
import { PageTabs } from "@/components/ui/page-tabs";

export type SettingsTab = { href: string; label: string };

/** One tab per settings concern; the layout decides which tabs exist (Payments is cloud-only). */
export function SettingsNav({ tabs }: { tabs: SettingsTab[] }) {
  const pathname = usePathname();
  const active = (href: string) =>
    href === "/admin/settings" ? pathname === href : pathname.startsWith(href);
  return <PageTabs label="Settings" items={tabs.map((t) => ({ ...t, active: active(t.href) }))} />;
}
