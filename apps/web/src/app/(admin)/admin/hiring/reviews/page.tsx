import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { ClipboardCheckIcon } from "lucide-react";
import { BetaBadge } from "@/components/beta-badge";
import { ApplicationPane } from "@/components/hiring/application-pane";
import { PaneHost } from "@/components/pane";
import { ContactsSkeleton } from "@/components/skeletons/pages";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { initialsOf } from "@/components/ui/avatar-stack";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { StatusChip } from "@/components/ui/status-chip";
import { fmtDay } from "@/server/hiring/apply-text";
import { listMyReviews } from "@/server/hiring/queries";
import { hiringContext } from "../context";

export const metadata = { title: "Reviews" };

const one = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : undefined);

/**
 * Hiring → Reviews: the reviews and interview feedback this member owes, soonest due first, and
 * the ones they have handed in. Only their own: others' reviews stay hidden until theirs is in
 * (the independence rule), and this page never shows them.
 */
async function ReviewsPage({ searchParams }: PageProps<"/admin/hiring/reviews">) {
  await connection();
  const [c, sp] = await Promise.all([hiringContext(), searchParams]);
  if (!c) redirect("/admin");
  const done = one(sp.view) === "done";
  const applicationId = one(sp.application) ?? null;
  const all = await listMyReviews(c.actor);
  const owed = all.filter((r) => r.status === "pending");
  const handedIn = all.filter((r) => r.status === "submitted");
  const rows = done ? handedIn : owed;
  const now = new Date();
  const tz = c.ws.timezone;
  const base = done ? "/admin/hiring/reviews?view=done" : "/admin/hiring/reviews";
  const open = (id: string) => `${base}${done ? "&" : "?"}application=${id}`;
  return (
    <div className="space-y-6">
      <PageHeader
        title="Reviews"
        badge={c.beta && <BetaBadge />}
        description="Reviews and interview feedback assigned to you."
      />
      <SegmentedTabs
        label="Reviews view"
        items={[
          { href: "/admin/hiring/reviews", label: "To do", count: owed.length, active: !done },
          {
            href: "/admin/hiring/reviews?view=done",
            label: "Submitted",
            count: handedIn.length,
            active: done,
          },
        ]}
      />
      {rows.length === 0 ? (
        <EmptyState
          icon={ClipboardCheckIcon}
          title={done ? "Nothing handed in yet." : "You're all caught up."}
          description={
            done ? undefined : "When a coordinator assigns you a candidate, it appears here."
          }
        />
      ) : (
        <ul className="divide-y rounded-xl border bg-card p-1.5">
          {rows.map((r) => {
            const late = !done && r.dueAt && r.dueAt < now;
            return (
              <li key={r.id}>
                <Link
                  href={open(r.applicationId)}
                  scroll={false}
                  className="flex flex-wrap items-center gap-3 rounded-lg px-3 py-2.5 text-sm outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <Avatar size="lg" aria-hidden>
                    <AvatarFallback>{initialsOf(r.candidate || "?")}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{r.candidate || "Candidate"}</p>
                    <p className="truncate text-muted-foreground">
                      {r.opportunity} · {r.stage} ·{" "}
                      {r.kind === "interview" ? "Interview feedback" : "Review"}
                    </p>
                  </div>
                  {done ? (
                    r.submittedAt && (
                      <span className="text-xs text-muted-foreground">
                        Submitted {fmtDay(r.submittedAt, tz)}
                      </span>
                    )
                  ) : r.dueAt ? (
                    <StatusChip tone={late ? "destructive" : "neutral"} dot={!!late}>
                      {late ? "Overdue" : `Due ${fmtDay(r.dueAt, tz)}`}
                    </StatusChip>
                  ) : null}
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

export default function ReviewsPageBoundary(props: PageProps<"/admin/hiring/reviews">) {
  return (
    <Suspense fallback={<ContactsSkeleton />}>
      <ReviewsPage {...props} />
    </Suspense>
  );
}
