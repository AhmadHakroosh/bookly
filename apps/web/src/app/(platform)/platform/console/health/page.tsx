import { connection } from "next/server";
import { Suspense } from "react";
import { CheckCircle2Icon, XCircleIcon } from "lucide-react";
import { loadEnv } from "@bookly/config";
import { healthReport, usageSince } from "@/server/ops";
import { PageSkeleton } from "@/components/page-skeleton";

export const metadata = { title: "Health", robots: { index: false } };

async function HealthPage() {
  await connection();
  const [checks, usage] = await Promise.all([healthReport(), usageSince(null, 1)]);
  const metrics = !!loadEnv().METRICS_TOKEN;
  return (
    <div className="space-y-6">
      <ul className="divide-y rounded-xl border text-sm">
        {checks.map((c) => (
          <li key={c.name} className="flex items-center gap-3 p-3">
            {c.ok ? (
              <CheckCircle2Icon className="size-4 shrink-0 text-emerald-500" aria-label="OK" />
            ) : (
              <XCircleIcon className="size-4 shrink-0 text-destructive" aria-label="Attention" />
            )}
            <span className="w-56 shrink-0 font-medium">{c.name}</span>
            <span className="text-muted-foreground">{c.detail}</span>
          </li>
        ))}
      </ul>
      <section className="rounded-xl border p-4 text-sm">
        <h3 className="text-base font-semibold tracking-tight">Today across all workspaces</h3>
        <p className="mt-1 text-muted-foreground">
          {Object.keys(usage).length
            ? Object.entries(usage)
                .map(([k, v]) => `${k}: ${v}`)
                .join(" · ")
            : "no counters yet"}
        </p>
      </section>
      <section className="rounded-xl border p-4 text-sm">
        <h3 className="text-base font-semibold tracking-tight">External monitoring</h3>
        <p className="mt-1 text-muted-foreground">
          {metrics
            ? "GET /api/metrics returns Prometheus text (bearer METRICS_TOKEN) with the counts, plan mix, MRR estimate and every check above as bookly_health{check}."
            : "Set METRICS_TOKEN to expose GET /api/metrics (Prometheus text) for Grafana, Better Stack or Uptime Kuma."}
        </p>
      </section>
    </div>
  );
}

export default function HealthPageBoundary() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <HealthPage />
    </Suspense>
  );
}
