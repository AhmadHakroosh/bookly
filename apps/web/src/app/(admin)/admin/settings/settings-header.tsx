"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { PageTabs } from "@/components/ui/page-tabs";

export type SettingsTab = { href: string; label: string; also?: string[] };
export type SettingsGroups = { workspace: SettingsTab[]; brand: SettingsTab[] };

const on = (pathname: string, href: string) =>
  href === "/admin/settings"
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);

/**
 * The top of every settings page: which half you are in (from the address), its tabs, and the
 * way across to the other half.
 */
export function SettingsHeader({ groups }: { groups: SettingsGroups }) {
  const pathname = usePathname();
  const brand = groups.brand.some((t) => on(pathname, t.href));
  const tabs = brand ? groups.brand : groups.workspace;
  return (
    <PageHeader
      title={brand ? "Brand & communications" : "Workspace settings"}
      description={
        brand
          ? "Make your booking page and emails feel like your own."
          : "Configure your workspace and connected tools."
      }
      actions={
        <Button
          variant="outline"
          nativeButton={false}
          render={<Link href={brand ? "/admin/settings" : "/admin/settings/branding"} />}
        >
          {brand ? "Workspace settings" : "Brand & communications"}
        </Button>
      }
    >
      <PageTabs
        label={brand ? "Brand and communications" : "Workspace settings"}
        items={tabs.map((t) => ({
          href: t.href,
          label: t.label,
          active: [t.href, ...(t.also ?? [])].some((h) => on(pathname, h)),
        }))}
      />
    </PageHeader>
  );
}
