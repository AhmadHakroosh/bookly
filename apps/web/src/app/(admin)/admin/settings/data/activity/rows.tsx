import type { AuditEntry } from "@bookly/db/schema";
import { fmtDateTime } from "@/lib/time";
import { describeAction } from "@/server/audit";

const ACTOR_KIND: Record<AuditEntry["actorType"], string> = {
  user: "",
  guest: "guest",
  api_key: "API key",
  integration: "integration",
  system: "automatic",
};

const show = (v: unknown) =>
  v === null || v === undefined || v === ""
    ? "—"
    : typeof v === "string"
      ? v.length > 60
        ? `${v.slice(0, 57)}…`
        : v
      : Array.isArray(v)
        ? v.join(", ")
        : typeof v === "object"
          ? JSON.stringify(v).slice(0, 60)
          : String(v);

/** One entry per row: when, who, what, on which target, and the fields that changed. */
export function ActivityRows({ rows, tz }: { rows: AuditEntry[]; tz: string }) {
  if (!rows.length) return null;
  return (
    <ol className="divide-y rounded-lg border text-sm">
      {rows.map((e) => {
        const changes = Object.entries(e.changes ?? {});
        return (
          <li key={e.id} className="grid gap-1 p-3 sm:grid-cols-[10rem_1fr] sm:gap-4">
            <time dateTime={e.createdAt.toISOString()} className="text-xs text-muted-foreground">
              {fmtDateTime(e.createdAt, tz)}
            </time>
            <div className="min-w-0 space-y-1">
              <p className="break-words">
                <span className="font-medium">{e.actorLabel}</span>
                {ACTOR_KIND[e.actorType] && (
                  <span className="text-muted-foreground"> ({ACTOR_KIND[e.actorType]})</span>
                )}{" "}
                <span className="text-muted-foreground">·</span> {describeAction(e.action)}
                {e.targetLabel && (
                  <>
                    {" "}
                    <span className="text-muted-foreground">·</span>{" "}
                    <span className="text-muted-foreground">{e.targetType.replace(/_/g, " ")}</span>{" "}
                    {e.targetLabel}
                  </>
                )}
              </p>
              {changes.length > 0 && (
                <dl className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                  {changes.map(([field, c]) => (
                    <div key={field} className="flex gap-1">
                      <dt className="font-medium">{field}:</dt>
                      <dd>
                        {c && "from" in c && c.from !== undefined ? (
                          <>
                            <s>{show(c.from)}</s> → {show(c.to)}
                          </>
                        ) : (
                          show(c?.to)
                        )}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
