import { SettingsSkeleton } from "@/components/skeletons/pages";
import { Suspense } from "react";
import { isCloud } from "@/server/platform";
import { requireStaff } from "@/server/session";
import { getCurrentWorkspace } from "@/server/workspace";
import { DangerZone } from "../danger-zone";

export const metadata = { title: "Data" };

async function DataPage() {
  const [{ role }, workspace] = await Promise.all([requireStaff(), getCurrentWorkspace()]);
  if (!workspace) return null;
  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Your data</h2>
        <p className="text-sm text-muted-foreground">
          Take a copy of everything, or delete the workspace for good. Both are for the workspace
          owner.
        </p>
      </div>
      <DangerZone slug={workspace.slug} owner={role === "owner"} cloud={isCloud()} />
    </div>
  );
}

export default function DataPageBoundary() {
  return (
    <Suspense fallback={<SettingsSkeleton />}>
      <DataPage />
    </Suspense>
  );
}
