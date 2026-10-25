"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { moveApplicationsAction } from "@/app/(admin)/admin/hiring/opportunities/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Failing = { applicationId: string; name: string; checks: { id: string; text: string }[] };
type Pending = { ids: string[]; to: string; toName: string; failing: Failing[] };

/**
 * Moving applications from the board, the bulk bar and the pane's stage menu. A stage's exit
 * checks are advice (ADR 0002): when one fails, nothing moves until the coordinator chooses
 * "Move anyway", which the server records with the check. `onSettled(false)` lets the board put
 * cards back when a move is cancelled or refused.
 */
export function useMove(opportunityId: string, onSettled?: (moved: boolean) => void) {
  const router = useRouter();
  // `pending` outlives `open` so the dialog keeps its words while it closes.
  const [pending, setPending] = useState<Pending | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // Not a transition: the dialog closes and the toast shows as soon as the server answers,
  // while the board's refresh follows in the background.
  const run = async (ids: string[], to: string, toName: string, override = false) => {
    setBusy(true);
    const r = await moveApplicationsAction(opportunityId, ids, to, override).catch(() => ({
      ok: false as const,
      error: "That didn't move. Try again.",
    }));
    setBusy(false);
    if (r.ok) {
      setOpen(false);
      if (r.moved)
        toast.success(r.moved === 1 ? `Moved to ${toName}` : `Moved ${r.moved} to ${toName}`);
      onSettled?.(true);
      router.refresh();
    } else if ("checks" in r) {
      setPending({ ids, to, toName, failing: r.checks });
      setOpen(true);
    } else {
      setOpen(false);
      toast.error(r.error);
      onSettled?.(false);
      router.refresh();
    }
  };

  const cancel = () => {
    setOpen(false);
    onSettled?.(false);
  };

  const one = pending?.failing.length === 1 ? pending.failing[0]! : null;
  const dialog = (
    <Dialog open={open} onOpenChange={(next) => !next && !busy && cancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="pe-6">
            {one
              ? `${one.checks.map((c) => c.text).join(". ")}. Move anyway?`
              : `${pending?.failing.length ?? 0} applications have unfinished checks. Move anyway?`}
          </DialogTitle>
          <DialogDescription>Moving anyway is recorded in the activity log.</DialogDescription>
        </DialogHeader>
        {pending && !one && (
          <ul className="max-h-48 space-y-1 overflow-y-auto text-sm">
            {pending.failing.map((f) => (
              <li key={f.applicationId}>
                <span className="font-medium">{f.name}</span>
                <span className="text-muted-foreground">
                  {" "}
                  · {f.checks.map((c) => c.text).join(", ")}
                </span>
              </li>
            ))}
          </ul>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={cancel} disabled={busy}>
            Cancel
          </Button>
          <Button
            onClick={() => pending && void run(pending.ids, pending.to, pending.toName, true)}
            disabled={busy}
          >
            Move anyway
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return {
    move: (ids: string[], to: string, toName: string) => void run(ids, to, toName),
    dialog,
    busy,
  };
}
