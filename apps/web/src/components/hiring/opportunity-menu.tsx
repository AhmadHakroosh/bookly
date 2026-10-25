"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { MoreHorizontalIcon } from "lucide-react";
import { toast } from "sonner";
import type { OpportunityStatus } from "@bookly/db/schema";
import {
  archiveOpportunityAction,
  closeOpportunityAction,
  copyOpportunityAction,
  discardDraftAction,
} from "@/app/(admin)/admin/hiring/opportunities/actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";

type Confirm = "copy" | "close" | "archive" | "discard" | null;

/** The opportunity's "⋯": Edit setup, Copy for a new cycle, Close applications, Archive. */
export function OpportunityMenu({
  id,
  title,
  status,
  canConfigure,
}: {
  id: string;
  title: string;
  status: OpportunityStatus;
  canConfigure: boolean;
}) {
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [team, setTeam] = useState(false);
  const [unheard, setUnheard] = useState<number | null>(null);
  const [pending, start] = useTransition();
  if (!canConfigure) return null;
  const run = (fn: () => Promise<{ error?: string; unheard?: number } | void>, done?: string) =>
    start(async () => {
      const r = await fn();
      if (r?.unheard) return setUnheard(r.unheard);
      if (r?.error) return void toast.error(r.error);
      setConfirm(null);
      if (done) toast.success(done);
    });
  const copy: Record<Exclude<Confirm, null>, { title: string; body: string; action: string }> = {
    copy: {
      title: "Copy for a new cycle",
      body: "A new draft with the same stages, questions, reviews and messages. Applications are never copied, and the dates are cleared.",
      action: "Copy",
    },
    close: {
      title: `Close applications for ${title}?`,
      body: "The application page stops taking new applications now. People who saved a draft are told applications have closed.",
      action: "Close applications",
    },
    archive: {
      title: `Archive ${title}?`,
      body: "It leaves the Opportunities list. Applicants keep their status pages.",
      action: "Archive",
    },
    discard: {
      title: `Discard this draft?`,
      body: "The draft, its stages, its forms and its messages are deleted. Nothing was published.",
      action: "Discard draft",
    },
  };
  const c = confirm && copy[confirm];
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="outline" size="icon" aria-label={`More actions for ${title}`} />}
        >
          <MoreHorizontalIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            render={<Link href={`/admin/hiring/opportunities/${id}/setup/stages`} />}
          >
            Edit setup
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setConfirm("copy")}>
            Copy for a new cycle
          </DropdownMenuItem>
          {status === "open" && (
            <DropdownMenuItem onClick={() => setConfirm("close")}>
              Close applications
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          {status === "draft" ? (
            <DropdownMenuItem variant="destructive" onClick={() => setConfirm("discard")}>
              Discard draft
            </DropdownMenuItem>
          ) : (
            status !== "archived" && (
              <DropdownMenuItem onClick={() => setConfirm("archive")}>Archive</DropdownMenuItem>
            )
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog
        open={!!c}
        onOpenChange={(o) => {
          if (!o) {
            setConfirm(null);
            setUnheard(null);
          }
        }}
      >
        {c && (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{c.title}</DialogTitle>
              <DialogDescription>{c.body}</DialogDescription>
            </DialogHeader>
            {confirm === "copy" && (
              <label className="flex items-start gap-2 text-sm">
                <Checkbox checked={team} onCheckedChange={(v) => setTeam(!!v)} className="mt-0.5" />
                <span>
                  Also copy the team
                  <span className="block text-xs text-muted-foreground">
                    Invitations go out again when you publish.
                  </span>
                </span>
              </label>
            )}
            {unheard !== null && (
              <p role="alert" className="rounded-md bg-warning-muted px-3 py-2 text-sm">
                {unheard} applicant{unheard === 1 ? " hasn't" : "s haven't"} heard a final decision
                yet. Release their decisions before archiving.
              </p>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirm(null)}>
                Cancel
              </Button>
              <Button
                variant={confirm === "discard" ? "destructive" : "ink"}
                disabled={pending || unheard !== null}
                onClick={() =>
                  confirm === "copy"
                    ? run(() => copyOpportunityAction(id, team))
                    : confirm === "close"
                      ? run(() => closeOpportunityAction(id), "Applications closed.")
                      : confirm === "archive"
                        ? run(() => archiveOpportunityAction(id))
                        : run(() => discardDraftAction(id))
                }
              >
                {pending && <Spinner data-icon="inline-start" />}
                {c.action}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}

/** The toast after publishing, once. */
export function PublishedToast({ message, link }: { message: string | null; link: string }) {
  useEffect(() => {
    if (!message) return;
    toast.success(message, {
      action: {
        label: "Copy link",
        onClick: () => void navigator.clipboard?.writeText(link),
      },
    });
    const url = new URL(window.location.href);
    url.searchParams.delete("published");
    window.history.replaceState(null, "", url);
  }, [message, link]);
  return null;
}
