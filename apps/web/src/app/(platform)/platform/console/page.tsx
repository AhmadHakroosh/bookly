import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { PLANS } from "@bookly/cloud";
import { Badge } from "@/components/ui/badge";
import { planName } from "@/server/billing";
import { listWorkspacesForConsole, platformStats } from "@/server/ops";
import { ExternalLink } from "@/components/links";
import { tenantUrl } from "@/server/platform";

export const metadata = { title: "Console", robots: { index: false } };

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-xl border p-4">
      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

async function ConsoleHome({ searchParams }: PageProps<"/platform/console">) {
  await connection();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const plan = typeof sp.plan === "string" ? sp.plan : "";
  const status = sp.status === "active" || sp.status === "suspended" ? sp.status : undefined;
  const [stats, rows] = await Promise.all([
    platformStats(),
    listWorkspacesForConsole({ q, plan: plan || undefined, status }),
  ]);
  const maxWeek = Math.max(1, ...stats.signupsByWeek.map((w) => w.n));
  return (
    <div className="space-y-8">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <Stat
          label="Workspaces"
          value={stats.workspaces}
          hint={Object.entries(stats.plans)
            .map(([p, n]) => `${n} ${planName(p)}`)
            .join(" · ")}
        />
        <Stat label="Users" value={stats.users} hint={`${stats.activeUsers7d} active in 7 days`} />
        <Stat label="Bookings" value={stats.bookings30d} hint="last 30 days" />
        <Stat
          label="Transcribed"
          value={`${stats.transcribedMinutes30d} min`}
          hint="last 30 days"
        />
        <Stat label="MRR" value={`$${stats.mrr}`} hint="estimate from plans" />
        <div className="rounded-xl border p-4">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Sign-ups, 12 weeks
          </p>
          <div className="mt-2 flex h-10 items-end gap-0.5" aria-label="Weekly sign-ups">
            {stats.signupsByWeek.length === 0 && (
              <span className="text-xs text-muted-foreground">none yet</span>
            )}
            {stats.signupsByWeek.map((w) => (
              <span
                key={w.week}
                title={`${w.week}: ${w.n}`}
                className="flex-1 rounded-sm bg-foreground/70"
                style={{ height: `${Math.max(8, (w.n / maxWeek) * 100)}%` }}
              />
            ))}
          </div>
        </div>
      </div>

      <form className="flex flex-wrap items-center gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search name, slug or owner email"
          className="h-8 w-72 rounded-lg border bg-background px-2 text-sm"
        />
        <select
          name="plan"
          defaultValue={plan}
          className="h-8 rounded-lg border bg-background px-2 text-sm"
          aria-label="Plan"
        >
          <option value="">Any plan</option>
          {Object.values(PLANS).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
          <option value="self-hosted">Self-hosted</option>
        </select>
        <select
          name="status"
          defaultValue={status ?? ""}
          className="h-8 rounded-lg border bg-background px-2 text-sm"
          aria-label="Status"
        >
          <option value="">Any status</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
        </select>
        <button type="submit" className="h-8 rounded-lg border px-3 text-sm">
          Filter
        </button>
      </form>

      <ul className="divide-y rounded-xl border text-sm">
        {rows.map(({ ws, ownerEmail, bookings, lastBookingAt }) => (
          <li key={ws.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <p className="font-medium">
                <Link href={`/console/${ws.id}`} className="hover:underline">
                  {ws.name}
                </Link>{" "}
                <span className="font-mono text-xs text-muted-foreground">{ws.slug}</span>
                {ws.suspendedAt && (
                  <Badge variant="secondary" className="ml-2">
                    Suspended
                  </Badge>
                )}
                {ws.planManagedBy === "operator" && (
                  <Badge variant="outline" className="ml-2">
                    Manual plan
                  </Badge>
                )}
              </p>
              <p className="text-muted-foreground">
                {ownerEmail ?? "no owner"} · {planName(ws.plan)}
                {ws.planStatus ? ` (${ws.planStatus})` : ""} · {bookings} bookings
                {lastBookingAt ? `, last ${new Date(lastBookingAt).toLocaleDateString()}` : ""} ·
                since {ws.createdAt.toLocaleDateString()}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <ExternalLink href={tenantUrl(ws.slug, "/")}>Open</ExternalLink>
              <Link href={`/console/${ws.id}`} className="underline underline-offset-4">
                Details
              </Link>
            </div>
          </li>
        ))}
        {rows.length === 0 && (
          <li className="p-8 text-center text-muted-foreground">No workspaces match.</li>
        )}
      </ul>
    </div>
  );
}

export default function ConsoleHomeBoundary(props: PageProps<"/platform/console">) {
  return (
    <Suspense fallback={null}>
      <ConsoleHome {...props} />
    </Suspense>
  );
}
