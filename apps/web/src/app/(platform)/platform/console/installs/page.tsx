import { connection } from "next/server";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { fmtDateTime } from "@/lib/time";
import { installSummary } from "@/server/telemetry";
import { PageSkeleton } from "@/components/page-skeleton";

export const metadata = { title: "Installs", robots: { index: false } };

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border p-4">
      <p className="text-2xl font-semibold tracking-tight">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

async function InstallsPage() {
  await connection();
  const s = await installSummary();
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Self-hosted installs</h2>
        <p className="text-sm text-muted-foreground">
          Installs that ran the daily update check. Usage totals cover only installs that opted in
          to share statistics.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Active in the last 7 days" value={s.active7} />
        <Stat label="Active in the last 30 days" value={s.active30} />
        <Stat label="Ever seen" value={s.total} />
        <Stat label="Sharing statistics" value={s.sharing} />
      </div>
      {s.totals && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Hosts (opted-in installs)" value={s.totals.hosts} />
          <Stat label="Bookings, last 30 days" value={s.totals.bookings30d} />
          <Stat label="Contacts" value={s.totals.contacts} />
        </div>
      )}
      <section>
        <h3 className="text-base font-semibold tracking-tight">Versions in use (30 days)</h3>
        <ul className="mt-2 flex flex-wrap gap-2">
          {s.byVersion.map(([v, n]) => (
            <li key={v}>
              <Badge variant="secondary">
                {v} · {n}
              </Badge>
            </li>
          ))}
          {s.byVersion.length === 0 && (
            <li className="text-sm text-muted-foreground">No pings yet.</li>
          )}
        </ul>
      </section>
      <section className="overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left">
              <th className="p-3 font-medium">Install</th>
              <th className="p-3 font-medium">Version</th>
              <th className="p-3 font-medium">Node</th>
              <th className="p-3 font-medium">First seen</th>
              <th className="p-3 font-medium">Last seen</th>
              <th className="p-3 font-medium">Pings</th>
              <th className="p-3 font-medium">Stats</th>
            </tr>
          </thead>
          <tbody>
            {s.rows.map((r) => (
              <tr key={r.id} className="border-b last:border-0">
                <td className="p-3 font-mono text-xs">{r.id.slice(0, 8)}</td>
                <td className="p-3">
                  {r.version}
                  {r.tenancy === "multi" && (
                    <Badge variant="outline" className="ml-2">
                      multi
                    </Badge>
                  )}
                </td>
                <td className="p-3">{r.nodeVersion ?? "—"}</td>
                <td className="p-3">{fmtDateTime(r.firstSeenAt, "UTC")}</td>
                <td className="p-3">{fmtDateTime(r.lastSeenAt, "UTC")}</td>
                <td className="p-3">{r.pings}</td>
                <td className="p-3 text-xs text-muted-foreground">
                  {r.stats
                    ? `${String(r.stats.hosts)} hosts · ${String(r.stats.bookings30d)} bookings/30d · ${(r.stats.integrations as string[]).join(", ") || "no integrations"}`
                    : "not shared"}
                </td>
              </tr>
            ))}
            {s.rows.length === 0 && (
              <tr>
                <td colSpan={7} className="p-6 text-center text-sm text-muted-foreground">
                  No installs have checked in yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

export default function InstallsPageBoundary() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <InstallsPage />
    </Suspense>
  );
}
