"use client";

import { useActionState, useState } from "react";
import { DownloadIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { deleteWorkspaceAction, type SettingsState } from "./actions";

/** Export and deletion: the two promises the privacy policy makes about your data. */
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
    <div className="space-y-4">
      <section className="space-y-3 rounded-lg border p-4">
        <h2 className="text-base font-semibold tracking-tight">Export your data</h2>
        <p className="text-sm text-muted-foreground">
          One JSON file with the workspace, members, event types, availability, bookings, contacts
          and their timeline, tasks, routing forms, transcripts and recaps. Secrets such as
          connected-account tokens and API keys are left out.
        </p>
        {owner ? (
          <Button
            variant="outline"
            nativeButton={false}
            render={<a href="/api/admin/export" download />}
          >
            <DownloadIcon data-icon="inline-start" />
            Download export
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">Only the workspace owner can export.</p>
        )}
      </section>
      <section className="space-y-3 rounded-lg border border-destructive/40 p-4">
        <h2 className="text-base font-semibold tracking-tight text-destructive">
          Delete this workspace
        </h2>
        <p className="text-sm text-muted-foreground">
          Removes the workspace, its booking pages, bookings, contacts, transcripts and members from
          the database immediately, and{" "}
          {cloud ? "cancels the subscription. " : "returns this install to the setup wizard. "}
          Copies in backups age out within 30 days. This cannot be undone; export first.
        </p>
        {owner ? (
          <form action={action} className="space-y-3">
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
                className="max-w-xs"
              />
              <FieldDescription>
                Members are signed out of this workspace as it goes.
              </FieldDescription>
            </Field>
            {state.error && <p className="text-sm text-destructive">{state.error}</p>}
            <Button type="submit" variant="destructive" disabled={pending || confirm !== slug}>
              <Trash2Icon data-icon="inline-start" />
              {pending ? "Deleting…" : "Delete workspace permanently"}
            </Button>
          </form>
        ) : (
          <p className="text-sm text-muted-foreground">Only the workspace owner can delete it.</p>
        )}
      </section>
    </div>
  );
}
