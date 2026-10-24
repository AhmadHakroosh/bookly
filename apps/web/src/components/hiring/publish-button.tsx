"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { publishAction } from "@/app/(admin)/admin/hiring/opportunities/actions";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

/**
 * S9's buttons: Publish (all or nothing; busy as "Publishing…"), disabled with its reason while
 * the checklist has red items, and the plan limit on Cloud Free with Close / Upgrade / Save as draft.
 */
export function PublishButton({
  oppId,
  failing,
  reasons,
}: {
  oppId: string;
  /** Checklist items still red. */
  failing: number;
  /** Words for the checklist ids the server may send back. */
  reasons: Record<string, string>;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string[] | null>(null);
  const [limit, setLimit] = useState<{ other: string | null } | null>(null);
  return (
    <div className="space-y-3">
      {limit && (
        <div
          role="alert"
          className="rounded-lg border border-warning/40 bg-warning-muted p-4 text-sm"
        >
          <p>
            Free includes 1 open opportunity.{" "}
            {limit.other
              ? `Close ${limit.other} or upgrade to Team to publish this one.`
              : "Upgrade to Team to publish this one."}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="ink"
              nativeButton={false}
              render={<Link href="/admin/billing" />}
            >
              Upgrade
            </Button>
            <Button
              size="sm"
              variant="outline"
              nativeButton={false}
              render={<Link href="/admin/hiring/opportunities" />}
            >
              Save as draft
            </Button>
          </div>
        </div>
      )}
      {error && (
        <ul
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
        >
          {error.map((e) => (
            <li key={e}>{reasons[e] ?? e}</li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {failing > 0 && (
          <span className="mr-auto text-sm text-muted-foreground" id="publish-reason">
            Fix {failing} item{failing === 1 ? "" : "s"} to publish
          </span>
        )}
        <Button
          variant="outline"
          nativeButton={false}
          render={<Link href="/admin/hiring/opportunities" />}
        >
          Save as draft
        </Button>
        <Button
          variant="ink"
          size="lg"
          disabled={failing > 0 || pending}
          aria-describedby={failing > 0 ? "publish-reason" : undefined}
          aria-busy={pending}
          onClick={() =>
            start(async () => {
              setError(null);
              setLimit(null);
              const r = await publishAction(oppId);
              if (r.ok) return;
              if ("limit" in r && r.limit) setLimit(r.limit);
              else
                setError(
                  r.reasons.length
                    ? r.reasons
                    : ["We couldn't publish. Nothing is live yet. Try again."],
                );
            })
          }
        >
          {pending && <Spinner data-icon="inline-start" />}
          {pending ? "Publishing…" : "Publish"}
        </Button>
      </div>
    </div>
  );
}
