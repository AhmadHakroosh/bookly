"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteNowAction, legalHoldAction } from "@/app/(admin)/admin/hiring/opportunities/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { StatusChip } from "@/components/ui/status-chip";
import { Textarea } from "@/components/ui/textarea";

export type DataRequestRow = {
  id: string;
  email: string;
  requested: string;
  daysLeft: number;
  deletesOn: string;
  held: string | null;
};

/**
 * The opportunity's deletion requests (application-page.md step 25): each with its legal
 * deadline. Delete now, or record a legal hold with the reason; nobody can extend the deadline.
 */
export function DataRequests({ rows }: { rows: DataRequestRow[] }) {
  const [holding, setHolding] = useState<DataRequestRow | null>(null);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ error?: string }>, ok: string, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (r.error) return void toast.error(r.error);
      toast.success(ok);
      after?.();
    });
  if (!rows.length) return <p className="text-sm text-muted-foreground">No deletion requests.</p>;
  return (
    <>
      <ul className="divide-y rounded-xl border bg-card text-sm" aria-busy={pending}>
        {rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate font-medium">{r.email}</p>
              <p className="text-xs text-muted-foreground">
                requested {r.requested} ·{" "}
                {r.held ? (
                  <>Legal hold: {r.held}</>
                ) : (
                  <>
                    {r.daysLeft} day{r.daysLeft === 1 ? "" : "s"} left · deletes automatically on{" "}
                    {r.deletesOn}
                  </>
                )}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {r.held && <StatusChip tone="warning">Held</StatusChip>}
              <Button
                size="sm"
                variant="destructive"
                disabled={pending}
                onClick={() => run(() => deleteNowAction(r.id), "Application deleted.")}
              >
                Delete now
              </Button>
              {!r.held && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => setHolding(r)}
                >
                  Record a legal hold
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
      <Dialog open={!!holding} onOpenChange={(o) => !o && setHolding(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record a legal hold</DialogTitle>
            <DialogDescription>
              The application is kept instead of deleted. The applicant is told, in your words, why.
            </DialogDescription>
          </DialogHeader>
          <label htmlFor="hold-reason" className="text-sm font-medium">
            Why it has to be kept
          </label>
          <Textarea
            id="hold-reason"
            rows={3}
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setHolding(null)}>
              Cancel
            </Button>
            <Button
              variant="ink"
              disabled={pending || !reason.trim()}
              onClick={() =>
                run(
                  () => legalHoldAction(holding!.id, reason),
                  "Legal hold recorded.",
                  () => {
                    setHolding(null);
                    setReason("");
                  },
                )
              }
            >
              {pending && <Spinner data-icon="inline-start" />}
              Record the hold
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
