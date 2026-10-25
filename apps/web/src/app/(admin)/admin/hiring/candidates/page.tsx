import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { SearchIcon, UsersIcon } from "lucide-react";
import type { StageCategory } from "@bookly/db/schema";
import { BetaBadge } from "@/components/beta-badge";
import { ApplicationPane } from "@/components/hiring/application-pane";
import { StageChip } from "@/components/hiring/stage-chip";
import { PaneHost } from "@/components/pane";
import { ContactsSkeleton } from "@/components/skeletons/pages";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { initialsOf } from "@/components/ui/avatar-stack";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { fmtDay } from "@/server/hiring/apply-text";
import { listCandidates, listOpportunitySummaries } from "@/server/hiring/queries";
import { hiringContext } from "../context";

export const metadata = { title: "Candidates" };

const one = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : undefined);

/**
 * Hiring → Candidates (hiring.png's sidebar): everyone who applied, across the opportunities the
 * member can see, newest first. A row opens the candidate pane right here.
 */
async function CandidatesPage({ searchParams }: PageProps<"/admin/hiring/candidates">) {
  const [c, sp] = await Promise.all([hiringContext(), searchParams]);
  if (!c) redirect("/admin");
  const q = one(sp.q) ?? "";
  const opportunity = one(sp.opportunity);
  const applicationId = one(sp.application) ?? null;
  const [rows, opportunities] = await Promise.all([
    listCandidates(c.actor, { q, opportunityId: opportunity }),
    listOpportunitySummaries(c.actor),
  ]);
  const open = opportunities.filter((o) => o.role && o.status !== "draft");
  const href = (next: { opportunity?: string; application?: string }) => {
    const p = new URLSearchParams();
    const opp = "opportunity" in next ? next.opportunity : opportunity;
    if (opp) p.set("opportunity", opp);
    if (q) p.set("q", q);
    if (next.application) p.set("application", next.application);
    const s = p.toString();
    return `/admin/hiring/candidates${s ? `?${s}` : ""}`;
  };
  const tz = c.ws.timezone;
  return (
    <div className="space-y-6">
      <PageHeader
        title="Candidates"
        badge={c.beta && <BetaBadge />}
        description="Everyone who applied, across your opportunities."
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        {open.length > 1 ? (
          <SegmentedTabs
            label="Opportunity"
            items={[
              { href: href({ opportunity: undefined }), label: "All", active: !opportunity },
              ...open.map((o) => ({
                href: href({ opportunity: o.id }),
                label: o.title,
                active: opportunity === o.id,
              })),
            ]}
          />
        ) : (
          <span />
        )}
        <form className="relative w-full sm:w-72" role="search">
          {opportunity && <input type="hidden" name="opportunity" value={opportunity} />}
          <SearchIcon
            className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            name="q"
            defaultValue={q}
            aria-label="Search candidates"
            placeholder="Search name or email"
            className="h-8 pl-9"
          />
        </form>
      </div>
      {rows.length === 0 ? (
        <EmptyState
          icon={UsersIcon}
          title={q || opportunity ? "No candidates match." : "No candidates yet."}
          description={
            q || opportunity
              ? undefined
              : "They appear here as soon as someone applies to an open opportunity."
          }
        />
      ) : (
        <ul className="divide-y rounded-xl border bg-card p-1.5">
          {rows.map((r) => {
            const name = r.name || r.email;
            return (
              <li key={r.id}>
                <Link
                  href={href({ application: r.id })}
                  scroll={false}
                  className="flex flex-wrap items-center gap-3 rounded-lg px-3 py-2.5 text-sm outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <Avatar size="lg" aria-hidden>
                    <AvatarFallback>{initialsOf(name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{name}</p>
                    <p className="truncate text-muted-foreground">
                      {r.opportunity} · Applied {fmtDay(r.appliedAt, tz)}
                    </p>
                  </div>
                  {r.state === "withdrawn" ? (
                    <span className="text-xs text-muted-foreground">Withdrawn</span>
                  ) : (
                    r.stage && (
                      <StageChip
                        name={r.stage}
                        category={(r.stageCategory ?? "open") as StageCategory}
                      />
                    )
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <PaneHost param="application" id={applicationId} label="Application">
        {applicationId && <ApplicationPane actor={c.actor} applicationId={applicationId} />}
      </PaneHost>
    </div>
  );
}

export default function CandidatesPageBoundary(props: PageProps<"/admin/hiring/candidates">) {
  return (
    <Suspense fallback={<ContactsSkeleton />}>
      <CandidatesPage {...props} />
    </Suspense>
  );
}
