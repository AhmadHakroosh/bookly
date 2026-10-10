import { SettingsSkeleton } from "@/components/skeletons/pages";
import Link from "next/link";
import { Suspense } from "react";
import { PLANS, planFor } from "@bookly/cloud";
import { DownloadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BackLink } from "@/components/links";
import { fmtDateTime } from "@/lib/time";
import {
  activityFacets,
  decodeCursor,
  describeAction,
  listActivity,
  type AuditFilters,
} from "@/server/audit";
import { hasFeature } from "@/server/limits";
import { isCloud } from "@/server/platform";
import { getCurrentWorkspace } from "@/server/workspace";
import { ActivityRows } from "./rows";

export const metadata = { title: "Activity" };

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** The filters as they came in, so links keep them. */
function query(sp: Search, extra: Record<string, string | null> = {}) {
  const q = new URLSearchParams();
  for (const k of ["actor", "action", "target", "from", "to"]) {
    const v = one(sp[k]);
    if (v) q.set(k, v);
  }
  for (const [k, v] of Object.entries(extra)) {
    if (v) q.set(k, v);
    else q.delete(k);
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

async function ActivityPage({ searchParams }: { searchParams: Promise<Search> }) {
  const [workspace, sp] = await Promise.all([getCurrentWorkspace(), searchParams]);
  if (!workspace) return null;
  const filters: AuditFilters = {
    actor: one(sp.actor) || undefined,
    action: one(sp.action) || undefined,
    targetType: one(sp.target) || undefined,
    from: one(sp.from) ? new Date(one(sp.from)) : undefined,
    to: one(sp.to) ? new Date(`${one(sp.to)}T23:59:59.999Z`) : undefined,
  };
  const cursor = decodeCursor(one(sp.before));
  const [{ rows, next }, facets] = await Promise.all([
    listActivity(workspace.id, { cursor, limit: 50, filters }),
    activityFacets(workspace.id),
  ]);
  const canExport = hasFeature(workspace, "activityExport");
  const retention = PLANS[workspace.plan as keyof typeof PLANS]?.limits.auditRetentionDays;
  const targets = [...new Set(facets.actions.map((a) => a.split(".")[0]!))];
  return (
    <div className="space-y-6">
      <BackLink href="/admin/settings/data">Data</BackLink>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Activity</h2>
          <p className="text-sm text-muted-foreground">
            Who did what in this workspace: every change by a member, a guest, an API key, an
            integration or Bookly itself.
            {isCloud() && retention
              ? ` Kept for ${retention >= 365 ? `${Math.round(retention / 365)} year${retention >= 730 ? "s" : ""}` : `${retention} days`} on the ${PLANS[workspace.plan as keyof typeof PLANS]?.name ?? ""} plan.`
              : ""}
          </p>
        </div>
        {canExport ? (
          <Button
            variant="outline"
            nativeButton={false}
            render={<a href={`/admin/settings/data/activity/csv${query(sp)}`} />}
          >
            <DownloadIcon data-icon="inline-start" />
            Download CSV
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground">
            CSV export comes with {PLANS[planFor("activityExport")].name}.{" "}
            <Link href="/admin/billing" className="underline underline-offset-4">
              Upgrade
            </Link>
          </p>
        )}
      </div>

      <form method="get" className="flex flex-wrap items-end gap-2 text-sm">
        <label className="grid gap-1">
          <span className="text-xs text-muted-foreground">Who</span>
          <select
            name="actor"
            defaultValue={filters.actor ?? ""}
            className="rounded-lg border bg-background pl-3 text-sm"
          >
            <option value="">Anyone</option>
            {facets.actors.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1">
          <span className="text-xs text-muted-foreground">What</span>
          <select
            name="action"
            defaultValue={filters.action ?? ""}
            className="rounded-lg border bg-background pl-3 text-sm"
          >
            <option value="">Anything</option>
            {facets.actions.map((a) => (
              <option key={a} value={a}>
                {describeAction(a)}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1">
          <span className="text-xs text-muted-foreground">On</span>
          <select
            name="target"
            defaultValue={filters.targetType ?? ""}
            className="rounded-lg border bg-background pl-3 text-sm"
          >
            <option value="">Any target</option>
            {targets.map((t) => (
              <option key={t} value={t}>
                {t.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1">
          <span className="text-xs text-muted-foreground">From</span>
          <Input type="date" name="from" defaultValue={one(sp.from)} className="w-40" />
        </label>
        <label className="grid gap-1">
          <span className="text-xs text-muted-foreground">To</span>
          <Input type="date" name="to" defaultValue={one(sp.to)} className="w-40" />
        </label>
        <Button type="submit" variant="outline">
          Filter
        </Button>
        {query(sp) && (
          <Button
            variant="ghost"
            nativeButton={false}
            render={<Link href="/admin/settings/data/activity" />}
          >
            Clear
          </Button>
        )}
      </form>

      <ActivityRows rows={rows} tz={workspace.timezone} />
      {rows.length === 0 && (
        <p className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
          {cursor || query(sp) ? "Nothing more here." : "Nothing recorded yet."}
        </p>
      )}
      {next && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            nativeButton={false}
            render={
              <Link
                href={`/admin/settings/data/activity${query(sp, { before: next })}`}
                scroll={false}
              />
            }
          >
            Show earlier
          </Button>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Times are shown in {workspace.timezone}. {fmtDateTime(new Date(), workspace.timezone)} now.
      </p>
    </div>
  );
}

export default function ActivityPageBoundary(props: { searchParams: Promise<Search> }) {
  return (
    <Suspense fallback={<SettingsSkeleton />}>
      <ActivityPage {...props} />
    </Suspense>
  );
}
