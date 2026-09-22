import { connection, NextResponse } from "next/server";
import { loadEnv } from "@bookly/config";
import { renderMetrics } from "@/server/metrics-text";
import { healthReport, platformStats, usageSince } from "@/server/ops";

/**
 * GET /api/metrics — Prometheus text format for external monitoring (Grafana, Better Stack,
 * Uptime Kuma). Protected by METRICS_TOKEN as a bearer token; disabled when unset.
 */
export async function GET(req: Request) {
  await connection(); // never prerender: the token and the numbers are request-time
  const token = loadEnv().METRICS_TOKEN;
  if (!token) return NextResponse.json({ error: "METRICS_TOKEN is not set" }, { status: 404 });
  if (req.headers.get("authorization") !== `Bearer ${token}`)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [stats, health, usage] = await Promise.all([
    platformStats(),
    healthReport(),
    usageSince(null, 1),
  ]);
  const body = renderMetrics([
    { name: "bookly_workspaces_total", help: "Workspaces", value: stats.workspaces },
    { name: "bookly_users_total", help: "Users", value: stats.users },
    {
      name: "bookly_active_users_7d",
      help: "Users with a session touched in 7 days",
      value: stats.activeUsers7d,
    },
    { name: "bookly_bookings_30d", help: "Bookings created in 30 days", value: stats.bookings30d },
    {
      name: "bookly_transcribed_minutes_30d",
      help: "Auto-capture minutes in 30 days",
      value: stats.transcribedMinutes30d,
    },
    { name: "bookly_mrr_usd", help: "Estimated monthly recurring revenue", value: stats.mrr },
    ...Object.entries(stats.plans).map(([plan, n]) => ({
      name: "bookly_workspaces_by_plan",
      help: "Workspaces per plan",
      value: n,
      labels: { plan },
    })),
    ...Object.entries(usage).map(([metric, n]) => ({
      name: "bookly_usage_today",
      help: "Usage counters today",
      value: n,
      labels: { metric },
    })),
    ...health.map((h) => ({
      name: "bookly_health",
      help: "1 = ok",
      value: h.ok ? 1 : 0,
      labels: { check: h.name },
    })),
  ]);
  return new NextResponse(body, {
    headers: {
      "content-type": "text/plain; version=0.0.4; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
