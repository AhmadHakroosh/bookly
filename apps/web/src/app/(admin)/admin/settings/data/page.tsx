import { SettingsSkeleton } from "@/components/skeletons/pages";
import Link from "next/link";
import { Suspense } from "react";
import { HistoryIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
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
        <p className="text-sm text-muted-foreground">
          See who changed what, take a copy of everything, or delete the workspace for good. Export
          and deletion are for the workspace owner.
        </p>
      </div>
      <section className="space-y-2 rounded-lg border p-4">
        <h2 className="text-base font-semibold tracking-tight">Activity</h2>
        <p className="text-sm text-muted-foreground">
          Who did what in this workspace: members, guests, API keys, integrations and Bookly itself,
          with what changed each time.
        </p>
        <Button
          variant="outline"
          nativeButton={false}
          render={<Link href="/admin/settings/data/activity" />}
        >
          <HistoryIcon data-icon="inline-start" />
          Open the activity log
        </Button>
      </section>
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
