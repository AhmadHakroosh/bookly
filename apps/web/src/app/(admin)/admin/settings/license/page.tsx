import { SettingsSkeleton } from "@/components/skeletons/pages";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import type { LicenseStatus } from "@bookly/editions";
import { Badge } from "@/components/ui/badge";
import { fmtDate } from "@/lib/time";
import {
  eeInstalled,
  installedEeFeatures,
  licenseStatus,
  type LicenseSource,
} from "@/server/editions";
import { isCloud } from "@/server/platform";
import { requireStaff } from "@/server/session";
import { LicenseForm } from "./license-form";

export const metadata = { title: "License" };

const STATE: Record<
  LicenseStatus["state"],
  { label: string; variant: "success" | "warning" | "destructive" | "outline" }
> = {
  missing: { label: "Community", variant: "outline" },
  valid: { label: "Active", variant: "success" },
  grace: { label: "Expired, in grace period", variant: "warning" },
  expired: { label: "Expired", variant: "destructive" },
  invalid: { label: "Not valid", variant: "destructive" },
};

const SOURCE: Record<Exclude<LicenseSource, null>, string> = {
  env: "the BOOKLY_LICENSE_KEY environment variable",
  file: "the file in BOOKLY_LICENSE_FILE",
  admin: "a key pasted here",
};

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-1 text-sm">
      <dt className="w-32 shrink-0 text-muted-foreground">{k}</dt>
      <dd className="min-w-0 flex-1 break-words">{v}</dd>
    </div>
  );
}

async function LicensePage() {
  // Request-time: license state depends on the clock (expiry, grace), never prerendered.
  await connection();
  // The license belongs to the install; on the hosted service the operator holds it.
  if (isCloud()) notFound();
  const [{ role }, { status, source }] = await Promise.all([requireStaff(), licenseStatus()]);
  const state = STATE[status.state];
  const lic =
    status.state === "valid" || status.state === "grace" || status.state === "expired"
      ? status.license
      : null;
  return (
    <div className="max-w-xl space-y-6">
      <p className="text-sm text-muted-foreground">
        Bookly&apos;s core is open source and complete without a license. A Bookly Enterprise
        license adds the commercial modules (single sign-on, compliance reports and more) to this
        install.
      </p>
      <section className="space-y-3 rounded-lg border p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold tracking-tight">This install</h2>
          <Badge variant={state.variant}>{state.label}</Badge>
        </div>
        <dl>
          {lic && (
            <>
              <Row k="Licensed to" v={lic.customer.name || lic.customer.id} />
              <Row k="Edition" v={<span className="capitalize">{lic.edition}</span>} />
              <Row
                k="Features"
                v={
                  (lic.features as string[]).includes("*")
                    ? "All commercial features"
                    : lic.features.join(", ")
                }
              />
              <Row k="Seats" v={lic.seats ?? "Unlimited"} />
              <Row
                k={status.state === "grace" ? "Grace ends in" : "Expires"}
                v={
                  status.state === "grace"
                    ? `${status.daysLeft} day${status.daysLeft === 1 ? "" : "s"}`
                    : `${fmtDate(new Date(lic.expiresAt), "UTC")}${status.state === "valid" ? ` (${status.daysLeft} days)` : ""}`
                }
              />
            </>
          )}
          {status.state === "invalid" && <Row k="Problem" v={status.reason} />}
          {source && <Row k="Key from" v={SOURCE[source]} />}
          <Row
            k="Modules"
            v={
              eeInstalled()
                ? installedEeFeatures().length
                  ? installedEeFeatures().join(", ")
                  : "License check only (no commercial features ship yet)"
                : "None in this build (Community image)"
            }
          />
        </dl>
        {status.state === "missing" && (
          <p className="text-sm text-muted-foreground">
            Every open-source feature works without a key. Development and 30-day trial keys are
            free on request.
          </p>
        )}
      </section>
      {role === "owner" ? (
        source === "env" || source === "file" ? (
          <p className="text-sm text-muted-foreground">
            The key comes from {SOURCE[source]}; change it there.
          </p>
        ) : (
          <LicenseForm hasAdminKey={source === "admin"} />
        )
      ) : (
        <p className="text-sm text-muted-foreground">
          Only the workspace owner can change the license.
        </p>
      )}
    </div>
  );
}

export default function LicensePageBoundary() {
  return (
    <Suspense fallback={<SettingsSkeleton />}>
      <LicensePage />
    </Suspense>
  );
}
