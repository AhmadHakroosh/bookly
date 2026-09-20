import { loadEnv } from "@bookly/config";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Host</TableHead>
            <TableHead>Status</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {domains.map((d) => (
            <TableRow key={d.id}>
              <TableCell>
                <span className="font-mono text-sm">{d.host}</span>
                {d.isPrimary && (
                  <Badge variant="secondary" className="ml-2">
                    Primary
                  </Badge>
                )}
                {!d.verifiedAt && d.verificationToken && (
                  <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                    <p>
                      1. Add a <strong>TXT</strong> record at{" "}
                      <code>
                        {VERIFY_PREFIX}.{d.host}
                      </code>{" "}
                      with value <code>{d.verificationToken}</code>
                    </p>
                    <p>
                      2. Point <code>{d.host}</code> at <code>{target}</code> (CNAME, or an A record
                      to the same IP)
                    </p>
                    {d.lastError && <p className="text-destructive">Last check: {d.lastError}</p>}
                  </div>
                )}
              </TableCell>
              <TableCell>
                <Badge variant={d.verifiedAt ? "default" : "outline"}>
                  {d.verifiedAt ? "Verified" : "Pending"}
                </Badge>
              </TableCell>
              <TableCell className="text-right whitespace-nowrap">
                {!d.verifiedAt && (
                  <form action={checkDomain.bind(null, d.id)} className="inline">
                    <Button type="submit" variant="outline" size="sm">
                      Verify
                    </Button>
                  </form>
                )}
                {d.verifiedAt && !d.isPrimary && (
                  <form action={makePrimary.bind(null, d.id)} className="inline">
                    <Button type="submit" variant="ghost" size="sm">
                      Make primary
                    </Button>
                  </form>
                )}
                {!d.isPrimary && (
                  <form action={removeDomain.bind(null, d.id)} className="inline">
                    <Button type="submit" variant="ghost" size="sm">
                      Remove
                    </Button>
                  </form>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

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
    <Suspense fallback={null}>
      <DomainsPage />
    </Suspense>
  );
}
