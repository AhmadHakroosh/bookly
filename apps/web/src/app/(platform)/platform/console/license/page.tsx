import { ConsoleHealthSkeleton } from "@/components/skeletons/pages";
import { connection } from "next/server";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { eeInstalled, installedEeFeatures, licenseStatus } from "@/server/editions";

export const metadata = { title: "License", robots: { index: false } };

/**
 * The hosted service's own license (ADR 0006): a `cloud` key in BOOKLY_LICENSE_KEY lets each
 * workspace's plan and grants decide its commercial features. Read-only: the key lives in the
 * deployment's environment, not in the database.
 */
async function LicensePage() {
  await connection();
  const { status, source } = await licenseStatus();
  const lic =
    status.state === "valid" || status.state === "grace" || status.state === "expired"
      ? status.license
      : null;
  const rows: [string, React.ReactNode][] = [
    [
      "State",
      <Badge
        key="s"
        variant={
          status.state === "valid" ? "success" : status.state === "grace" ? "warning" : "outline"
        }
      >
        {status.state}
      </Badge>,
    ],
    [
      "Modules",
      eeInstalled()
        ? installedEeFeatures().join(", ") || "license check only"
        : "none (Community image)",
    ],
    ["Key from", source ?? "not set"],
    ...(lic
      ? ([
          ["Edition", lic.edition],
          ["Licensed to", lic.customer.name || lic.customer.id],
          ["Features", (lic.features as string[]).join(", ")],
          ["Seats", lic.seats ?? "unlimited"],
          [
            "Expires",
            `${lic.expiresAt.slice(0, 10)} (${status.state === "valid" ? `${status.daysLeft} days left` : status.state})`,
          ],
        ] as [string, React.ReactNode][])
      : []),
    ...(status.state === "invalid"
      ? ([["Problem", status.reason]] as [string, React.ReactNode][])
      : []),
  ];
  return (
    <div className="space-y-4">
      <dl className="divide-y rounded-xl border text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="flex gap-3 p-3">
            <dt className="w-32 shrink-0 text-muted-foreground">{k}</dt>
            <dd className="min-w-0 flex-1 break-words">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="max-w-2xl text-sm text-muted-foreground">
        The hosted service runs with a <code className="font-mono text-xs">cloud</code> license in{" "}
        <code className="font-mono text-xs">BOOKLY_LICENSE_KEY</code>; each workspace then gets the
        commercial features of its plan plus the grants on its console page. Keys are issued with{" "}
        <code className="font-mono text-xs">pnpm --filter @bookly/ee-licensing issue sign</code>.
      </p>
    </div>
  );
}

export default function LicensePageBoundary() {
  return (
    <Suspense fallback={<ConsoleHealthSkeleton />}>
      <LicensePage />
    </Suspense>
  );
}
