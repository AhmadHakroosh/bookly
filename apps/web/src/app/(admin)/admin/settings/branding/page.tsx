import { SettingsSkeleton } from "@/components/skeletons/pages";
import { Suspense } from "react";
import { hasFeature } from "@/server/limits";
import { getCurrentWorkspace } from "@/server/workspace";
import { BrandingForm } from "./branding-form";

export const metadata = { title: "Branding" };

async function BrandingPage() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;
  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Branding</h2>
        <p className="text-sm text-muted-foreground">
          Shown on your booking pages and in every email guests receive: your logo next to the
          workspace name, and your colour on buttons and selected dates. Leave blank for the Bookly
          mark and accent.
        </p>
      </div>
      <BrandingForm
        workspace={{
          logoUrl: workspace.settings.branding?.logoUrl ?? "",
          accent: workspace.settings.branding?.accent ?? "",
        }}
        allowed={hasFeature(workspace, "removeBranding")}
      />
    </div>
  );
}

export default function BrandingPageBoundary() {
  return (
    <Suspense fallback={<SettingsSkeleton />}>
      <BrandingPage />
    </Suspense>
  );
}
