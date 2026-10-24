import Link from "next/link";
import type { ComponentProps } from "react";
import { AccountMenu } from "@/components/account-menu";
import { AdminNav } from "@/components/admin-nav";
import { Logo } from "@/components/brand/logo";
import { WorkspaceSwitcher, type SwitcherWorkspace } from "@/components/workspace-switcher";
import type { NavOptions } from "./nav";

export type SidebarWorkspace = {
  current: { id: string; name: string; logoUrl?: string | null };
  workspaces?: SwitcherWorkspace[];
  allUrl?: string;
  newUrl?: string;
};

/**
 * The admin's left column on Sand, as `app ui.png` draws it: the Bookly lockup, the workspace
 * switcher, the nav (no group headings), and the account card at the foot. The same content
 * fills the mobile sheet.
 */
export function AppSidebar({
  workspace,
  nav,
  account,
}: {
  workspace: SidebarWorkspace;
  nav: NavOptions;
  account: Omit<ComponentProps<typeof AccountMenu>, "variant">;
}) {
  return (
    <div className="flex min-h-full flex-col gap-5 px-3 pt-4 pb-3">
      <Link
        href="/admin"
        className="flex h-8 w-fit items-center rounded-md px-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        aria-label="Bookly home"
      >
        <Logo size={24} />
      </Link>
      <WorkspaceSwitcher {...workspace} />
      <div className="flex flex-1 flex-col">
        <AdminNav {...nav} />
      </div>
      <div className="border-t border-sidebar-border pt-3">
        <AccountMenu {...account} variant="card" />
      </div>
    </div>
  );
}
