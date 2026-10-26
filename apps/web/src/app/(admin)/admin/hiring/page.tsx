import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { BriefcaseIcon, PlusIcon } from "lucide-react";
import { BetaBadge } from "@/components/beta-badge";
import { HiringSkeleton } from "@/components/skeletons/pages";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusChip } from "@/components/ui/status-chip";
import { listOpportunitySummaries } from "@/server/hiring/queries";
import { mayCreateOpportunity } from "@/server/hiring/setup";
import { opportunityMeta, opportunityStatus } from "@/server/hiring/setup-text";
import { hiringContext, opportunityPath, setupPath } from "./context";

export const metadata = { title: "Hiring" };

/**
 * Hiring's home: the opportunities running now and the drafts being set up. Candidates,
 * interviews and reviews join it as their slices ship.
 */
async function HiringPage() {
  const c = await hiringContext();
  if (!c) redirect("/admin");
  const list = (await listOpportunitySummaries(c.actor)).filter((o) => o.status !== "closed");
  const create = mayCreateOpportunity(c.actor) && (
    <Button
      variant="ink"
      nativeButton={false}
      render={<Link href="/admin/hiring/opportunities/new" />}
    >
      <PlusIcon data-icon="inline-start" />
      Create opportunity
    </Button>
  );
  return (
    <div className="space-y-6">
      <PageHeader
        title="Overview"
        badge={c.beta && <BetaBadge />}
        description="Selection rounds in this workspace: fellowships, cohorts, internships, programs and admissions."
        actions={list.length ? create : null}
      />
      {!list.length ? (
        <EmptyState
          icon={BriefcaseIcon}
          title="Run your first selection round."
          description="Set up stages, reviewers and messages once, and every applicant hears from you at each step."
          action={create}
        />
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {list.map((o) => {
            const s = opportunityStatus(o.status, o.opensAt);
            return (
              <li key={o.id} className="rounded-xl border bg-card p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  {o.role ? (
                    <Link
                      href={
                        o.status === "draft" ? setupPath(o.id, "basics") : opportunityPath(o.id)
                      }
                      className="font-semibold hover:underline"
                    >
                      {o.title}
                    </Link>
                  ) : (
                    <span className="font-semibold">{o.title}</span>
                  )}
                  <StatusChip tone={s.tone} dot>
                    {s.label}
                  </StatusChip>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {opportunityMeta(o, c.ws.timezone) || " "}
                </p>
                {o.role && o.status !== "draft" && (
                  <p className="mt-3 text-sm">
                    <span className="font-semibold tabular-nums">{o.applications}</span>{" "}
                    <span className="text-muted-foreground">
                      application{o.applications === 1 ? "" : "s"}
                    </span>
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
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
