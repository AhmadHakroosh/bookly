import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PLANS } from "@bookly/cloud";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BackLink, ExternalLink } from "@/components/links";
import { fmtDateTime } from "@/lib/time";
import { planName } from "@/server/billing";
import { workspaceDetail } from "@/server/ops";
import { tenantUrl } from "@/server/platform";
import {
  impersonateOwner,
  releasePlan,
  setPlan,
  suspendWorkspace,
  unsuspendWorkspace,
} from "../actions";

export const metadata = { title: "Workspace", robots: { index: false } };

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-1 text-sm">
      <dt className="w-40 shrink-0 text-muted-foreground">{k}</dt>
      <dd className="min-w-0 flex-1">{v}</dd>
    </div>
  );
}

async function WorkspacePage({ params }: PageProps<"/platform/console/[id]">) {
  const { id } = await params;
  const d = await workspaceDetail(id);
  if (!d) notFound();
  const { ws } = d;
  const stripeBase = "https://dashboard.stripe.com";
  return (
    <div className="space-y-8">
      <div>
        <BackLink href="/console">Workspaces</BackLink>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-semibold tracking-tight">{ws.name}</h2>
          <span className="font-mono text-xs text-muted-foreground">{ws.slug}</span>
          {ws.suspendedAt && <Badge variant="secondary">Suspended</Badge>}
          {ws.planManagedBy === "operator" && <Badge variant="outline">Manual plan</Badge>}
          <ExternalLink href={tenantUrl(ws.slug, "/")}>Open</ExternalLink>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border p-4">
          <h3 className="text-base font-semibold tracking-tight">Overview</h3>
          <dl className="mt-2 divide-y">
            <Row k="Created" v={ws.createdAt.toLocaleString()} />
            <Row k="Timezone" v={ws.timezone} />
            <Row
              k="Plan"
              v={`${planName(ws.plan)}${ws.planStatus ? ` (${ws.planStatus})` : ""}${ws.planRenewsAt ? `, renews ${ws.planRenewsAt.toLocaleDateString()}` : ""}`}
            />
            {ws.planManagedBy === "operator" && (
              <Row
                k="Manual plan"
                v={`${ws.planNote ?? "no note"}${ws.planExpiresAt ? ` · until ${ws.planExpiresAt.toLocaleDateString()}` : " · no expiry"}`}
              />
            )}
            <Row
              k="Stripe"
              v={
                ws.stripeCustomerId ? (
                  <span className="flex flex-wrap gap-3">
                    <ExternalLink href={`${stripeBase}/customers/${ws.stripeCustomerId}`}>
                      customer
                    </ExternalLink>
                    {ws.stripeSubscriptionId && (
                      <ExternalLink href={`${stripeBase}/subscriptions/${ws.stripeSubscriptionId}`}>
                        subscription
                      </ExternalLink>
                    )}
                  </span>
                ) : (
                  "no customer"
                )
              }
            />
            {ws.suspendedAt && (
              <Row
                k="Suspended"
                v={`${ws.suspendedAt.toLocaleString()}${ws.suspendReason ? ` · ${ws.suspendReason}` : ""}`}
              />
            )}
          </dl>
          <h4 className="mt-4 text-sm font-semibold">Members</h4>
          <ul className="mt-1 space-y-1 text-sm">
            {d.members.map((m) => (
              <li key={m.userId} className="flex items-center gap-2">
                <span>{m.email}</span>
                <Badge variant="secondary">{m.role}</Badge>
                {m.banned && <Badge variant="destructive">banned</Badge>}
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-xl border p-4">
          <h3 className="text-base font-semibold tracking-tight">Usage</h3>
          <dl className="mt-2 divide-y">
            <Row k="Bookings" v={`${d.bookingsTotal} total · ${d.bookings30d} in 30 days`} />
            <Row k="Contacts" v={d.contacts} />
            <Row k="Event types" v={d.eventTypes} />
            <Row k="Transcribed" v={`${d.transcribedMinutesMonth} min this month`} />
            <Row
              k="API"
              v={`${d.apiKeys} keys · ${d.usage30d["api.requests"] ?? 0} key requests, ${d.usage30d["api.public"] ?? 0} public in 30 days`}
            />
            <Row
              k="Webhooks"
              v={`${d.webhooks} endpoints · ${d.failedDeliveries30d} failed deliveries in 30 days`}
            />
            <Row
              k="Integrations"
              v={
                d.integrations.length
                  ? d.integrations
                      .map((i) => `${i.provider}${i.status === "error" ? " (error)" : ""}`)
                      .join(", ")
                  : "none"
              }
            />
          </dl>
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border p-4">
          <h3 className="text-base font-semibold tracking-tight">Actions</h3>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <form action={impersonateOwner.bind(null, ws.id)}>
              <Button type="submit" variant="outline" size="sm">
                Sign in as owner
              </Button>
            </form>
            {ws.suspendedAt ? (
              <form action={unsuspendWorkspace.bind(null, ws.id)}>
                <Button type="submit" variant="outline" size="sm">
                  Unsuspend
                </Button>
              </form>
            ) : (
              <form action={suspendWorkspace.bind(null, ws.id)} className="flex gap-1">
                <input
                  name="reason"
                  placeholder="Reason"
                  className="h-8 w-40 rounded-md border bg-background px-2 text-sm"
                />
                <Button type="submit" variant="ghost" size="sm">
                  Suspend
                </Button>
              </form>
            )}
          </div>
          <h4 className="mt-5 text-sm font-semibold">Plan override</h4>
          <p className="text-xs text-muted-foreground">
            For comps, trials and partner deals. Stripe events leave a manual plan alone until you
            release it; an expiry drops it back to Free automatically.
          </p>
          <form
            action={setPlan.bind(null, ws.id)}
            className="mt-2 flex flex-wrap items-center gap-2"
          >
            <select
              name="plan"
              defaultValue={ws.plan in PLANS ? ws.plan : "pro"}
              className="h-8 rounded-lg border bg-background px-2 text-sm"
              aria-label="Plan"
            >
              {Object.values(PLANS).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <input
              name="until"
              type="date"
              className="h-8 rounded-lg border bg-background px-2 text-sm"
              aria-label="Until"
            />
            <input
              name="note"
              placeholder="Note (e.g. 3-month trial)"
              defaultValue={ws.planNote ?? ""}
              className="h-8 w-52 rounded-lg border bg-background px-2 text-sm"
            />
            <Button type="submit" size="sm">
              Set plan
            </Button>
          </form>
          {ws.planManagedBy === "operator" && (
            <form action={releasePlan.bind(null, ws.id)} className="mt-2">
              <Button type="submit" variant="ghost" size="sm">
                Release to Stripe
              </Button>
            </form>
          )}
        </section>

        <section className="rounded-xl border p-4">
          <h3 className="text-base font-semibold tracking-tight">Recent bookings</h3>
          <ul className="mt-2 divide-y text-sm">
            {d.recentBookings.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-2 py-1.5">
                <span className="truncate">
                  {b.title ?? "Meeting"} · {b.attendeeEmail}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {fmtDateTime(b.startAt, ws.timezone)} · {b.status}
                </span>
              </li>
            ))}
            {d.recentBookings.length === 0 && (
              <li className="py-2 text-muted-foreground">None yet.</li>
            )}
          </ul>
        </section>
      </div>

      <section className="rounded-xl border p-4">
        <h3 className="text-base font-semibold tracking-tight">
          Operator actions on this workspace
        </h3>
        <ul className="mt-2 divide-y text-sm">
          {d.audit.map((a) => (
            <li key={a.id} className="flex flex-wrap justify-between gap-2 py-1.5">
              <span>
                <span className="font-mono text-xs">{a.action}</span> by {a.actorEmail}
                {Object.keys(a.data).length ? (
                  <span className="text-muted-foreground"> · {JSON.stringify(a.data)}</span>
                ) : null}
              </span>
              <span className="text-xs text-muted-foreground">{a.createdAt.toLocaleString()}</span>
            </li>
          ))}
          {d.audit.length === 0 && <li className="py-2 text-muted-foreground">Nothing yet.</li>}
        </ul>
        <p className="mt-2 text-xs">
          <Link href="/console/audit" className="underline underline-offset-4">
            Full audit log
          </Link>
        </p>
      </section>
    </div>
  );
}

export default function WorkspacePageBoundary(props: PageProps<"/platform/console/[id]">) {
  return (
    <Suspense fallback={null}>
      <WorkspacePage {...props} />
    </Suspense>
  );
}
