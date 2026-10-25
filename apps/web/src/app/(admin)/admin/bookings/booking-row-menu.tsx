"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ChevronDownIcon, MoreHorizontalIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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

/*
 * ⋯ on a booking row (`ui mocks.png` 02): open it, and what the host can do from the list:
 * confirm a request, mark a no-show (or undo it), cancel with a reason the guest is told. The
 * actions come bound from the page.
 */
export function BookingRowMenu({
  label,
  openHref,
  trigger = "icon",
  extra = [],
  past,
  confirm,
  noShow,
  undoNoShow,
  cancel,
}: {
  /** "Intro call with Maya Chen": names the menu for screen readers. */
  label: string;
  /** Open the booking; left out where the booking is already open (its pane, its page). */
  openHref?: string;
  /** `icon`: ⋯ on a row; `more`: "More actions ▾" in the booking's own header. */
  trigger?: "icon" | "more";
  /** Links first in the menu ("Open contact", "Open page"). */
  extra?: { href: string; label: string }[];
  past: boolean;
  confirm?: () => Promise<void>;
  noShow?: () => Promise<void>;
  undoNoShow?: () => Promise<void>;
  cancel?: (form: FormData) => Promise<void>;
}) {
  const [pending, start] = useTransition();
  const [cancelling, setCancelling] = useState(false);
  const run = (fn: () => Promise<void>, done: string) =>
    start(async () => {
      await fn();
      toast.success(done);
    });
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            trigger === "more" ? (
              <Button variant="outline" disabled={pending} />
            ) : (
              <Button
                variant="ghost"
                size="icon-sm"
                disabled={pending}
                aria-label={`More for ${label}`}
              />
            )
          }
        >
          {trigger === "more" ? (
            <>
              More actions
              <ChevronDownIcon data-icon="inline-end" />
            </>
          ) : (
            <MoreHorizontalIcon />
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {openHref && (
            <DropdownMenuItem render={<Link href={openHref} scroll={false} />}>
              {past ? "Open notes" : "Open briefing"}
            </DropdownMenuItem>
          )}
          {extra.map((l) => (
            <DropdownMenuItem key={l.href} render={<Link href={l.href} />}>
              {l.label}
            </DropdownMenuItem>
          ))}
          {confirm && (
            <DropdownMenuItem onClick={() => run(confirm, "Booking confirmed")}>
              Confirm
            </DropdownMenuItem>
          )}
          {noShow && (
            <DropdownMenuItem onClick={() => run(noShow, "Marked as a no-show")}>
              Mark no-show
            </DropdownMenuItem>
          )}
          {undoNoShow && (
            <DropdownMenuItem onClick={() => run(undoNoShow, "No-show undone")}>
              Undo no-show
            </DropdownMenuItem>
          )}
          {cancel && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => setCancelling(true)}>
                Cancel booking…
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {cancel && (
        <Dialog open={cancelling} onOpenChange={(o) => !pending && setCancelling(o)}>
          <DialogContent>
            <form
              action={(f) =>
                start(async () => {
                  await cancel(f);
                  setCancelling(false);
                  toast.success("Booking cancelled. They've been told.");
                })
              }
              className="grid gap-4"
            >
              <DialogHeader>
                <DialogTitle>Cancel {label}?</DialogTitle>
                <DialogDescription>
                  They get an email with your reason, and the time opens up again.
                </DialogDescription>
              </DialogHeader>
              <textarea
                name="reason"
                rows={3}
                aria-label="Cancellation reason"
                placeholder="Reason (optional)"
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
              />
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  disabled={pending}
                  onClick={() => setCancelling(false)}
                >
                  Keep it
                </Button>
                <Button type="submit" variant="destructive" disabled={pending}>
                  Cancel booking
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
