import { Suspense } from "react";
import { requireManager } from "@/server/session";
import { getCurrentWorkspace } from "@/server/workspace";
import { settingsGroups } from "./groups";
import { SettingsHeader } from "./settings-header";

export const metadata = { title: "Settings" };

/**
 * Workspace settings and Brand & communications, one page per concern. The role check lives
 * here so every tab and every form under /admin/settings is owner/admin only; members are sent
 * back to Home. Domains, outside this folder, draws the same header.
 */
export default function SettingsLayout({ children }: LayoutProps<"/admin/settings">) {
  return (
    <Suspense fallback={null}>
      <SettingsShell>{children}</SettingsShell>
    </Suspense>
  );
}

async function SettingsShell({ children }: { children: React.ReactNode }) {
  const [, ws] = await Promise.all([requireManager(), getCurrentWorkspace()]);
  return (
    <div className="space-y-6">
      <SettingsHeader groups={await settingsGroups(ws)} />
      {children}
    </div>
  );
}
