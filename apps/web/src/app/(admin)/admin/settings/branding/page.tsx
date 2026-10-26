import { SettingsSkeleton } from "@/components/skeletons/pages";
import { Suspense } from "react";
import { connection } from "next/server";
import { hasFlag } from "@/server/flags";
import { hasFeature } from "@/server/limits";
import { getCurrentWorkspace } from "@/server/workspace";
import { previewMail } from "@/server/email-preview";
import { requireStaff } from "@/server/session";
import { BrandingForm } from "./branding-form";

export const metadata = { title: "Branding" };

async function BrandingPage() {
  const [{ session }, workspace] = await Promise.all([requireStaff(), getCurrentWorkspace()]);
  if (!workspace) return null;
  // The preview books a sample meeting two days from now: render per request.
  await connection();
  const preview = await previewMail(
    workspace,
    { id: session.user.id, name: session.user.name },
    "confirmation",
  );
  return (
    <div className="grid items-start gap-5 lg:grid-cols-2">
      <section aria-labelledby="brand-title" className="rounded-xl border bg-card p-4 sm:p-5">
        <h2 id="brand-title" className="text-base font-semibold tracking-tight">
          Your brand
        </h2>
        <p className="mt-1 mb-5 text-sm text-muted-foreground">
          Shown on your booking pages and in every email guests receive: your logo next to the
          workspace name, and your colour on buttons and selected dates. Leave blank for the Bookly
          mark and accent.
        </p>
        <BrandingForm
          workspace={{
            logoUrl: workspace.settings.branding?.logoUrl ?? "",
            accent: workspace.settings.branding?.accent ?? "",
          }}
          allowed={hasFeature(workspace, "removeBranding")}
          uploads={await hasFlag(workspace, "file_uploads")}
        />
      </section>
      <section aria-labelledby="preview-title" className="rounded-xl border bg-card p-4 sm:p-5">
        <h2 id="preview-title" className="text-base font-semibold tracking-tight">
          Email confirmation preview
        </h2>
        <p className="mt-1 mb-4 text-sm text-muted-foreground">
          What a guest receives when they book, with your brand. Save to see a change here.
        </p>
        <iframe
          title="Email confirmation preview"
          // Rendered here, so a save shows the new logo and colour at once.
          srcDoc={preview}
          // No scripts; same-origin so the logo loads under the page's CSP.
          sandbox="allow-same-origin"
          className="h-[34rem] w-full rounded-lg border bg-white"
        />
      </section>
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
