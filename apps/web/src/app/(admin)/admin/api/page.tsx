import { Suspense } from "react";
import { desc, eq, inArray, schema } from "@bookly/db";
import { loadEnv } from "@bookly/config";
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
import { db } from "@/lib/db";
import { getCurrentWorkspace } from "@/server/workspace";
import { deleteWebhook, pingWebhook, retryDelivery, revokeApiKey, toggleWebhook } from "./actions";
import { ApiKeyForm, WebhookForm } from "./forms";

export const metadata = { title: "API & webhooks" };

async function ApiPage() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;
  const base = loadEnv().APP_URL.replace(/\/$/, "");
  const [keys, hooks] = await Promise.all([
    db()
      .select()
      .from(schema.apiKeys)
      .where(eq(schema.apiKeys.workspaceId, workspace.id))
      .orderBy(desc(schema.apiKeys.createdAt)),
    db()
      .select()
      .from(schema.webhooks)
      .where(eq(schema.webhooks.workspaceId, workspace.id))
      .orderBy(desc(schema.webhooks.createdAt)),
  ]);
  const deliveries = hooks.length
    ? await db()
        .select()
        .from(schema.webhookDeliveries)
        .where(
          inArray(
            schema.webhookDeliveries.webhookId,
            hooks.map((h) => h.id),
          ),
        )
        .orderBy(desc(schema.webhookDeliveries.createdAt))
        .limit(30)
    : [];
  const hookUrl = new Map(hooks.map((h) => [h.id, h.url]));

  return (
    <div className="space-y-12">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">API & webhooks</h1>
        <p className="text-sm text-muted-foreground">
          Event types and availability need no key. Keys unlock reading and creating bookings. Spec:{" "}
          <a
            href={`${base}/api/v1/openapi.json`}
            className="underline underline-offset-4"
            target="_blank"
            rel="noreferrer"
          >
            /api/v1/openapi.json
          </a>{" "}
          · Guide: <code>docs/api.md</code>
        </p>
      </div>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">API keys</h2>
        <ApiKeyForm />
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Key</TableHead>
              <TableHead>Scopes</TableHead>
              <TableHead>Last used</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {keys.map((k) => (
              <TableRow key={k.id} className={k.revokedAt ? "opacity-50" : ""}>
                <TableCell className="font-medium">{k.name}</TableCell>
                <TableCell className="font-mono text-xs">{k.prefix}…</TableCell>
                <TableCell className="text-xs">{k.scopes.join(", ") || "public only"}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {k.lastUsedAt?.toLocaleString() ?? "never"}
                </TableCell>
                <TableCell className="text-right">
                  {k.revokedAt ? (
                    <Badge variant="secondary">Revoked</Badge>
                  ) : (
                    <form action={revokeApiKey.bind(null, k.id)}>
                      <Button type="submit" variant="ghost" size="sm">
                        Revoke
                      </Button>
                    </form>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {keys.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  No keys yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Webhooks</h2>
        <WebhookForm />
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>URL</TableHead>
              <TableHead>Events</TableHead>
              <TableHead>Last</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {hooks.map((h) => (
              <TableRow key={h.id} className={h.active ? "" : "opacity-50"}>
                <TableCell>
                  <p className="font-mono text-xs">{h.url}</p>
                  {h.description && (
                    <p className="text-xs text-muted-foreground">{h.description}</p>
                  )}
                </TableCell>
                <TableCell className="text-xs">{h.events.join(", ")}</TableCell>
                <TableCell className="text-xs">
                  {h.lastStatus ? (
                    <Badge variant={h.lastStatus < 300 ? "default" : "secondary"}>
                      {h.lastStatus}
                    </Badge>
                  ) : (
                    "—"
                  )}
                  {h.failures > 0 && (
                    <span className="ml-2 text-destructive">{h.failures} failing</span>
                  )}
                </TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  <form action={pingWebhook.bind(null, h.id)} className="inline">
                    <Button type="submit" variant="ghost" size="sm">
                      Ping
                    </Button>
                  </form>
                  <form action={toggleWebhook.bind(null, h.id, !h.active)} className="inline">
                    <Button type="submit" variant="ghost" size="sm">
                      {h.active ? "Disable" : "Enable"}
                    </Button>
                  </form>
                  <form action={deleteWebhook.bind(null, h.id)} className="inline">
                    <Button type="submit" variant="ghost" size="sm">
                      Delete
                    </Button>
                  </form>
                </TableCell>
              </TableRow>
            ))}
            {hooks.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  No webhooks yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        {deliveries.length > 0 && (
          <>
            <h3 className="text-sm font-medium">Recent deliveries</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Event</TableHead>
                  <TableHead>Endpoint</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Attempts</TableHead>
                  <TableHead className="text-right">When</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {deliveries.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-mono text-xs">{d.event}</TableCell>
                    <TableCell className="max-w-60 truncate font-mono text-xs text-muted-foreground">
                      {hookUrl.get(d.webhookId)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={d.status === "delivered" ? "default" : "secondary"}>
                        {d.status}
                        {d.responseStatus ? ` · ${d.responseStatus}` : ""}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{d.attempts}</TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {d.createdAt.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      {d.status !== "delivered" && (
                        <form action={retryDelivery.bind(null, d.id)}>
                          <Button type="submit" variant="ghost" size="sm">
                            Retry
                          </Button>
                        </form>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </section>
    </div>
  );
}

export default function ApiPageBoundary() {
  return (
    <Suspense fallback={null}>
      <ApiPage />
    </Suspense>
  );
}
