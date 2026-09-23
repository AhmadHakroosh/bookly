import { PageSkeleton } from "@/components/page-skeleton";
import { loadEnv } from "@bookly/config";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { SubmitButton } from "@/components/submit-button";
import { dnsTarget, listDomains, VERIFY_PREFIX } from "@/server/domains";
import { getCurrentWorkspace } from "@/server/workspace";
import { checkDomain, makePrimary, removeDomain } from "./actions";
import { AddDomainForm } from "./add-domain-form";

export const metadata = { title: "Domains" };

async function DomainsPage() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;
  const env = loadEnv();
  const domains = await listDomains(workspace.id);
  const target = dnsTarget();
  const single = env.TENANCY === "single";

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Domains</h1>
        <p className="text-sm text-muted-foreground">
          {single ? (
            <>
              This installation serves <code>{new URL(env.APP_URL).host}</code> (from{" "}
              <code>APP_URL</code>). Add the hostnames you point at it so links and feeds use the
              right one.
            </>
          ) : (
            <>
              Your workspace is available at{" "}
              <code>
                {workspace.slug}.{env.ROOT_DOMAIN}
              </code>
              . Add a custom domain and point it at <code>{target}</code>.
            </>
          )}
        </p>
      </div>

      <AddDomainForm />

      <ul className="divide-y rounded-xl border">
        {domains.map((d) => (
          <li key={d.id} className="space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="font-mono text-sm break-all">{d.host}</span>
                <Badge variant={d.verifiedAt ? "default" : "outline"}>
                  {d.verifiedAt ? "Verified" : "Pending"}
                </Badge>
                {d.isPrimary && <Badge variant="secondary">Primary</Badge>}
              </div>
              <div className="flex flex-wrap gap-1">
                {!d.verifiedAt && (
                  <form action={checkDomain.bind(null, d.id)}>
                    <SubmitButton variant="outline">Verify</SubmitButton>
                  </form>
                )}
                {d.verifiedAt && !d.isPrimary && (
                  <form action={makePrimary.bind(null, d.id)}>
                    <SubmitButton variant="ghost">Make primary</SubmitButton>
                  </form>
                )}
                {!d.isPrimary && (
                  <form action={removeDomain.bind(null, d.id)}>
                    <SubmitButton variant="ghost">Remove</SubmitButton>
                  </form>
                )}
              </div>
            </div>
            {!d.verifiedAt && d.verificationToken && (
              <ol className="space-y-2 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
                <li className="break-words">
                  1. Add a <strong>TXT</strong> record at{" "}
                  <code className="break-all text-foreground">
                    {VERIFY_PREFIX}.{d.host}
                  </code>{" "}
                  with the value{" "}
                  <code className="break-all text-foreground">{d.verificationToken}</code>
                </li>
                <li className="break-words">
                  2. Point <code className="break-all text-foreground">{d.host}</code> at{" "}
                  <code className="break-all text-foreground">{target}</code> (CNAME, or an A record
                  to the same IP), then press Verify.
                </li>
                {d.lastError && (
                  <li className="break-words text-destructive">Last check: {d.lastError}</li>
                )}
              </ol>
            )}
          </li>
        ))}
        {domains.length === 0 && (
          <li className="p-6 text-center text-sm text-muted-foreground">No domains yet.</li>
        )}
      </ul>

      <div className="rounded-xl border p-4 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">HTTPS</p>
        <p className="mt-1">
          Self-hosting with Docker Compose: run the <code>tls</code> profile and Caddy obtains
          certificates automatically for every verified domain (see <code>docs/domains.md</code>).
          Behind your own proxy or a platform like Vercel, add the domain there as well.
        </p>
      </div>
    </div>
  );
}

/** Suspense boundary for Cache Components: the page reads request data and streams in. */
export default function DomainsPageBoundary() {
  return (
    <Suspense
      fallback={
        <div className="max-w-3xl">
          <PageSkeleton />
        </div>
      }
    >
      <DomainsPage />
    </Suspense>
  );
}
