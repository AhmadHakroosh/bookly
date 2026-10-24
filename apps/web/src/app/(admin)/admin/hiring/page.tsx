import { redirect } from "next/navigation";
import { Suspense } from "react";
import { BriefcaseIcon } from "lucide-react";
import { BetaBadge } from "@/components/beta-badge";
import { HiringSkeleton } from "@/components/skeletons/pages";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { hasFlag } from "@/server/flags";
import { requireStaff } from "@/server/session";
import { getCurrentWorkspace } from "@/server/workspace";

export const metadata = { title: "Hiring" };

/**
 * Hiring's home in the sidebar, for workspaces with the `hiring` flag. Opportunities,
 * applications and reviews (ADR 0003) fill it as they ship; until then it says so.
 */
async function HiringPage() {
  const [, ws] = await Promise.all([requireStaff(), getCurrentWorkspace()]);
  if (!ws || !(await hasFlag(ws, "hiring"))) redirect("/admin");
  return (
    <div className="space-y-6">
      <PageHeader
        title="Hiring"
        badge={<BetaBadge />}
        description="Opportunities, applications and reviews for this workspace."
      />
      <EmptyState
        icon={BriefcaseIcon}
        title="No opportunities yet"
        description="Your workspace is in the hiring beta. Opportunities, applications and reviews appear here as they ship, so there is nothing to set up yet."
      />
    </div>
  );
}

export default function HiringPageBoundary() {
  return (
    <Suspense fallback={<HiringSkeleton />}>
      <HiringPage />
    </Suspense>
  );
}
