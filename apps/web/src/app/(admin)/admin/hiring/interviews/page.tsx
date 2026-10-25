import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { CalendarIcon, VideoIcon } from "lucide-react";
import { BetaBadge } from "@/components/beta-badge";
import { ApplicationPane } from "@/components/hiring/application-pane";
import { PaneHost } from "@/components/pane";
import { BookingsSkeleton } from "@/components/skeletons/pages";
import { Agenda, AgendaItem } from "@/components/ui/agenda";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { fmtDate, formatInTz } from "@/lib/time";
import { listInterviews } from "@/server/hiring/queries";
import { listProfiles } from "@/server/scheduling";
import { hiringContext } from "../context";

export const metadata = { title: "Interviews" };

const one = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : undefined);

/**
 * Hiring → Interviews: every interview the member can see, across opportunities, as an agenda
 * grouped by day. Upcoming soonest first; Past most recent first. A row opens the candidate.
 */
async function InterviewsPage({ searchParams }: PageProps<"/admin/hiring/interviews">) {
  await connection();
  const [c, sp] = await Promise.all([hiringContext(), searchParams]);
  if (!c) redirect("/admin");
  const past = one(sp.view) === "past";
  const applicationId = one(sp.application) ?? null;
  const now = new Date();
  const [rows, profiles] = await Promise.all([
    listInterviews(c.actor, { past, now }),
    listProfiles(c.ws.id),
  ]);
  const hostName = (id: string) => profiles.find((p) => p.userId === id)?.displayName ?? "";
  const tz = c.ws.timezone;
  // A 24-hour clock, as Home's day timeline reads.
  const clock = (at: Date) =>
    formatInTz(at, tz, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const days = new Map<string, typeof rows>();
  for (const r of rows) {
    const key = fmtDate(r.startAt, tz);
    days.set(key, [...(days.get(key) ?? []), r]);
  }
  const base = past ? "/admin/hiring/interviews?view=past" : "/admin/hiring/interviews";
  const open = (id: string) => `${base}${past ? "&" : "?"}application=${id}`;
  return (
    <div className="space-y-6">
      <PageHeader
        title="Interviews"
        badge={c.beta && <BetaBadge />}
        description="Interviews across your opportunities, in your workspace's time zone."
      />
      <SegmentedTabs
        label="Interviews view"
        items={[
          { href: "/admin/hiring/interviews", label: "Upcoming", active: !past },
          { href: "/admin/hiring/interviews?view=past", label: "Past", active: past },
        ]}
      />
      {rows.length === 0 ? (
        <EmptyState
          icon={CalendarIcon}
          title={past ? "No past interviews." : "No interviews coming up."}
          description={
            past
              ? undefined
              : "Candidates book them from the interview stage's link, or you schedule them from the candidate."
          }
        />
      ) : (
        <div className="max-w-3xl space-y-6">
          {[...days].map(([day, items]) => (
            <section key={day} aria-label={day} className="space-y-2">
              <h2 className="text-sm font-semibold text-muted-foreground">{day}</h2>
              <Agenda>
                {items.map((r) => {
                  const live = !past && r.startAt.getTime() - now.getTime() < 15 * 60_000;
                  const host = hostName(r.hostUserId);
                  return (
                    <AgendaItem
                      key={r.id}
                      time={clock(r.startAt)}
                      end={clock(r.endAt)}
                      dateTime={r.startAt.toISOString()}
                      active={live}
                      title={
                        <Link
                          href={open(r.applicationId)}
                          scroll={false}
                          className="hover:underline"
                        >
                          {r.candidate || "Candidate"}
                        </Link>
                      }
                      subtitle={[r.opportunity, r.stage].filter(Boolean).join(" · ")}
                      meta={host ? `With ${host}` : undefined}
                      actions={
                        live && r.meetingUrl ? (
                          <Button
                            size="sm"
                            nativeButton={false}
                            render={<a href={r.meetingUrl} target="_blank" rel="noreferrer" />}
                          >
                            <VideoIcon data-icon="inline-start" />
                            Join
                          </Button>
                        ) : undefined
                      }
                    />
                  );
                })}
              </Agenda>
            </section>
          ))}
        </div>
      )}
      <PaneHost param="application" id={applicationId} label="Application">
        {applicationId && <ApplicationPane actor={c.actor} applicationId={applicationId} />}
      </PaneHost>
    </div>
  );
}

export default function InterviewsPageBoundary(props: PageProps<"/admin/hiring/interviews">) {
  return (
    <Suspense fallback={<BookingsSkeleton />}>
      <InterviewsPage {...props} />
    </Suspense>
  );
}
