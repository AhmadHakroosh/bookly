import "server-only";
import type { Workspace } from "@bookly/db/schema";
import { hasFlag } from "@/server/flags";
import { isCloud } from "@/server/platform";
import type { SettingsGroups } from "./settings-header";

/**
 * The two halves of Settings as the concepts draw them: Workspace settings (`mocks.png` 08) and
 * Brand & communications (06). Pipeline and License join the first where they apply; Payments is
 * Stripe's row under Integrations, so its page lights that tab.
 */
export async function settingsGroups(ws: Workspace | null): Promise<SettingsGroups> {
  const pipelines = !!ws && (await hasFlag(ws, "pipelines"));
  return {
    workspace: [
      { href: "/admin/settings", label: "General" },
      {
        href: "/admin/settings/integrations",
        label: "Integrations",
        also: ["/admin/settings/payments"],
      },
      { href: "/admin/settings/api", label: "API" },
      { href: "/admin/settings/data", label: "Privacy" },
      ...(pipelines ? [{ href: "/admin/settings/pipeline", label: "Pipeline" }] : []),
      // The install's Enterprise license; on the hosted service the operator holds it.
      ...(isCloud() ? [] : [{ href: "/admin/settings/license", label: "License" }]),
    ],
    brand: [
      { href: "/admin/settings/branding", label: "Branding" },
      { href: "/admin/domains", label: "Domains" },
      { href: "/admin/settings/emails", label: "Emails" },
    ],
  };
}
