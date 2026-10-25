"use client";

import { useActionState, useState } from "react";
import { TriangleAlertIcon } from "lucide-react";
import { BusyOverlay } from "@/components/busy-overlay";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { SubmitButton } from "@/components/submit-button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { deleteWorkspaceAction, type SettingsState } from "./actions";

/**
 * The Danger zone (`mocks.png` 08): one red-tinted row and "Delete workspace". The button opens
 * a dialog that says what goes and asks for the workspace's address before it does.
 */
export function DangerZone({
  slug,
  owner,
  cloud,
}: {
  slug: string;
  owner: boolean;
  cloud: boolean;
}) {
  const [state, action, pending] = useActionState(deleteWorkspaceAction, {} as SettingsState);
  const [confirm, setConfirm] = useState("");
  return (
    <section
      aria-labelledby="danger-title"
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 sm:px-5"
    >
      <div className="flex min-w-0 items-start gap-3">
        <TriangleAlertIcon className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden />
        <div className="min-w-0">
          <h2 id="danger-title" className="text-sm font-semibold text-destructive">
            Danger zone
          </h2>
          <p className="text-sm text-muted-foreground">
            {owner
              ? "Permanently delete this workspace and all of its data."
              : "Only the workspace owner can delete it."}
          </p>
        </div>
      </div>
      {owner && (
        <Dialog onOpenChange={(open) => !open && setConfirm("")}>
          <DialogTrigger render={<Button variant="destructive" size="sm" />}>
            Delete workspace
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete this workspace?</DialogTitle>
              <DialogDescription>
                Removes the workspace, its booking pages, bookings, contacts, transcripts and
                members from the database immediately, and{" "}
                {cloud
                  ? "cancels the subscription. "
                  : "returns this install to the setup wizard. "}
                Copies in backups age out within 30 days. This cannot be undone; export first.
              </DialogDescription>
            </DialogHeader>
            <form action={action} id="delete-workspace">
              <Field>
                <FieldLabel htmlFor="confirm">
                  Type <span className="font-mono">{slug}</span> to confirm
                </FieldLabel>
                <Input
                  id="confirm"
                  name="confirm"
                  autoComplete="off"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
                <FieldDescription>
                  Members are signed out of this workspace as it goes.
                </FieldDescription>
              </Field>
              {state.error && <p className="mt-3 text-sm text-destructive">{state.error}</p>}
            </form>
            <DialogFooter>
              <SubmitButton
                form="delete-workspace"
                variant="destructive"
                disabled={confirm !== slug || pending}
                pendingText="Deleting…"
              >
                Delete workspace permanently
              </SubmitButton>
            </DialogFooter>
            <BusyOverlay show={pending} label="Deleting the workspace…" />
          </DialogContent>
        </Dialog>
      )}
    </section>
  );
}
