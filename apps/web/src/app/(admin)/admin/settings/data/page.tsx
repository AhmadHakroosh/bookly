import { SettingsSkeleton } from "@/components/skeletons/pages";
import Link from "next/link";
import { Suspense } from "react";
import { DownloadIcon, HistoryIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isCloud } from "@/server/platform";
import { requireStaff } from "@/server/session";
import { getCurrentWorkspace } from "@/server/workspace";
import { DangerZone } from "../danger-zone";
import { RetentionForm } from "../retention-form";

export const metadata = { title: "Privacy" };

/**
 * Data & privacy (`mocks.png` 08): how long transcripts are kept, a copy of everything, who
 * changed what, and the Danger zone. Export and deletion are the owner's.
 */
async function DataPage() {
  const [{ role }, workspace] = await Promise.all([requireStaff(), getCurrentWorkspace()]);
  if (!workspace) return null;
  const owner = role === "owner";
  return (
    <div className="max-w-3xl space-y-6">
      <section
        aria-labelledby="privacy-title"
        className="divide-y rounded-xl border bg-card [&>div]:px-4 [&>div]:py-4 sm:[&>div]:px-5"
      >
        <div>
          <h2 id="privacy-title" className="text-base font-semibold tracking-tight">
            Data & privacy
          </h2>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="max-w-md min-w-0">
            <label htmlFor="retention" className="text-sm font-medium">
              Transcript retention
            </label>
            <p className="text-sm text-muted-foreground">
              Meeting transcripts are deleted after this. Recaps, notes and bookings stay until you
              delete them. Applies to calls recorded from now on.
            </p>
          </div>
          <RetentionForm days={workspace.settings.capture?.retentionDays ?? 90} />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="max-w-md min-w-0">
            <p className="text-sm font-medium">Export workspace data</p>
            <p className="text-sm text-muted-foreground">
              One JSON file with members, event types, availability, bookings, contacts, tasks,
              routing forms, transcripts and recaps. Tokens and API keys are left out.
            </p>
          </div>
          {owner ? (
            <Button
              variant="outline"
              nativeButton={false}
              render={<a href="/api/admin/export" download />}
            >
              <DownloadIcon data-icon="inline-start" />
              Export workspace data
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">Only the owner can export.</p>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="max-w-md min-w-0">
            <p className="text-sm font-medium">Activity</p>
            <p className="text-sm text-muted-foreground">
              Who did what in this workspace: members, guests, API keys, integrations and Bookly
              itself, with what changed each time.
            </p>
          </div>
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href="/admin/settings/data/activity" />}
          >
            <HistoryIcon data-icon="inline-start" />
            Open the activity log
          </Button>
        </div>
      </section>
      <DangerZone slug={workspace.slug} owner={owner} cloud={isCloud()} />
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
