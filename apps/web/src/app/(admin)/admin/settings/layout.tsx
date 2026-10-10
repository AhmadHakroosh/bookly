import { Suspense } from "react";
import { paymentsConfigured } from "@/server/payments";
import { isCloud } from "@/server/platform";
import { requireManager } from "@/server/session";
import { SettingsNav, type SettingsTab } from "./settings-nav";

export const metadata = { title: "Settings" };

/**
 * Workspace settings, one page per concern. The role check lives here so every tab and every
 * form under /admin/settings is owner/admin only; members are sent back to Home.
 */
export default function SettingsLayout({ children }: LayoutProps<"/admin/settings">) {
  return (
    <Suspense fallback={null}>
      <SettingsShell>{children}</SettingsShell>
    </Suspense>
  );
}

async function SettingsShell({ children }: { children: React.ReactNode }) {
  await requireManager();
  const tabs: SettingsTab[] = [
    { href: "/admin/settings", label: "General" },
    { href: "/admin/settings/branding", label: "Branding" },
    { href: "/admin/settings/emails", label: "Emails" },
    { href: "/admin/settings/integrations", label: "Integrations" },
    ...(isCloud() && paymentsConfigured()
      ? [{ href: "/admin/settings/payments", label: "Payments" }]
      : []),
    { href: "/admin/settings/data", label: "Data" },
  ];
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Shared by everyone in the workspace. Owners and admins can change these.
        </p>
      </div>
      <SettingsNav tabs={tabs} />
      {children}
    </div>
  );
}
