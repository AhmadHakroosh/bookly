import Link from "next/link";
import { Suspense } from "react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentWorkspace } from "@/server/workspace";

async function AdminDashboard() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          {workspace.name} · <span className="font-mono">{workspace.slug}</span> ·{" "}
          {workspace.timezone}
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(
          [
            ["Booking page", "Your public profile and timezone.", "/admin/profile"],
            ["Event types", "Define what people can book.", "/admin/event-types"],
            [
              "Availability",
              "Weekly hours and date overrides. Arrives in K1.",
              "/admin/availability",
            ],
            [
              "Calendars & conferencing",
              "Google Calendar, Outlook, Meet, Zoom, Teams, Daily. Arrives in K2.",
              "/admin/calendars",
            ],
          ] as [string, string, string][]
        ).map(([t, d, href]) => (
          <Link key={t} href={href}>
            <Card>
              <CardHeader>
                <CardTitle>{t}</CardTitle>
                <CardDescription>{d}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default function AdminDashboardBoundary() {
  return (
    <Suspense fallback={null}>
      <AdminDashboard />
    </Suspense>
  );
}
