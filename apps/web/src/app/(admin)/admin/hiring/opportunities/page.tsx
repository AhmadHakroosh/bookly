import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { BriefcaseIcon, PlusIcon } from "lucide-react";
import { BetaBadge } from "@/components/beta-badge";
import { OpportunitiesSkeleton } from "@/components/skeletons/pages";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusChip } from "@/components/ui/status-chip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listOpportunitySummaries } from "@/server/hiring/queries";
import { mayCreateOpportunity } from "@/server/hiring/setup";
import { opportunityMeta, opportunityStatus } from "@/server/hiring/setup-text";
import { hiringContext, opportunityPath, setupPath } from "../context";

export const metadata = { title: "Opportunities" };

const fmt = (d: Date | null, timeZone: string) =>
  d
    ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone }).format(d)
    : "—";

/**
 * Every opportunity in the workspace (opportunity-setup.md): drafts with "Continue setup",
 * the open ones with their dates and how many applications the viewer may see.
 */
async function OpportunitiesPage() {
  const c = await hiringContext();
  if (!c) redirect("/admin");
  const { ws, actor, beta } = c;
  const list = await listOpportunitySummaries(actor);
  const canCreate = mayCreateOpportunity(actor);
  const create = canCreate && (
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
        title="Opportunities"
        badge={beta && <BetaBadge />}
        description="Fellowships, cohorts, internships, programs and admissions: each with its own stages, team and messages."
        actions={list.length ? create : null}
      />
      {!list.length ? (
        <EmptyState
          icon={BriefcaseIcon}
          title="Run your first selection round."
          description="Set up stages, reviewers and messages once, and every applicant hears from you at each step."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {create}
              <Button variant="outline" nativeButton={false} render={<Link href="/docs/hiring" />}>
                See how a fellowship is set up
              </Button>
            </div>
          }
        />
      ) : (
        <>
          {/* Phones: one card per opportunity, Create stays the primary action. */}
          <ul className="grid grid-cols-1 gap-3 md:hidden">
            {list.map((o) => {
              const s = opportunityStatus(o.status, o.opensAt);
              return (
                <li key={o.id} className="rounded-xl border bg-card p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <Link
                      href={
                        o.status === "draft" ? setupPath(o.id, "basics") : opportunityPath(o.id)
                      }
                      className="font-medium hover:underline"
                    >
                      {o.title}
                    </Link>
                    <StatusChip tone={s.tone} dot>
                      {s.label}
                    </StatusChip>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {opportunityMeta({ ...o }, ws.timezone)}
                  </p>
                </li>
              );
            })}
          </ul>
          <div className="hidden rounded-xl border bg-card md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Opportunity</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Applications close</TableHead>
                  <TableHead>Decisions by</TableHead>
                  <TableHead className="text-right">Applications</TableHead>
                  <TableHead>
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((o) => {
                  const s = opportunityStatus(o.status, o.opensAt);
                  const href =
                    o.status === "draft" ? setupPath(o.id, "basics") : opportunityPath(o.id);
                  return (
                    <TableRow key={o.id}>
                      <TableCell>
                        {o.role ? (
                          <Link href={href} className="font-medium hover:underline">
                            {o.title}
                          </Link>
                        ) : (
                          <span className="font-medium">{o.title}</span>
                        )}
                        {o.cohort && (
                          <div className="text-xs text-muted-foreground">{o.cohort}</div>
                        )}
                      </TableCell>
                      <TableCell>
                        <StatusChip tone={s.tone} dot>
                          {s.label}
                        </StatusChip>
                      </TableCell>
                      <TableCell>{fmt(o.closesAt, ws.timezone)}</TableCell>
                      <TableCell>{fmt(o.decidesBy, ws.timezone)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {o.role ? o.applications : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {o.status === "draft" && o.role === "coordinator" && (
                          <Button
                            size="sm"
                            variant="outline"
                            nativeButton={false}
                            render={<Link href={href} />}
                          >
                            Continue setup
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}

export default function OpportunitiesPageBoundary() {
  return (
    <Suspense fallback={<OpportunitiesSkeleton />}>
      <OpportunitiesPage />
    </Suspense>
  );
}
