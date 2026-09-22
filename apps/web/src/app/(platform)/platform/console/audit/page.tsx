import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { listAudit } from "@/server/ops";

export const metadata = { title: "Audit log", robots: { index: false } };

async function AuditPage() {
  await connection();
  const rows = await listAudit({ limit: 200 });
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Every operator action: suspensions, impersonations, plan overrides, bans. Newest first, last
        200.
      </p>
      <ul className="divide-y rounded-xl border text-sm">
        {rows.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
            <span>
              <span className="font-mono text-xs">{a.action}</span> · {a.actorEmail} ·{" "}
              {a.targetType === "workspace" && a.targetId ? (
                <Link href={`/console/${a.targetId}`} className="underline underline-offset-4">
                  workspace
                </Link>
              ) : (
                `${a.targetType}${a.targetId ? ` ${a.targetId.slice(0, 8)}` : ""}`
              )}
              {Object.keys(a.data).length ? (
                <span className="text-muted-foreground"> · {JSON.stringify(a.data)}</span>
              ) : null}
            </span>
            <span className="text-xs text-muted-foreground">{a.createdAt.toLocaleString()}</span>
          </li>
        ))}
        {rows.length === 0 && (
          <li className="p-8 text-center text-muted-foreground">No operator actions yet.</li>
        )}
      </ul>
    </div>
  );
}

export default function AuditPageBoundary() {
  return (
    <Suspense fallback={null}>
      <AuditPage />
    </Suspense>
  );
}
