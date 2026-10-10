"use client";

import { useActionState, useState } from "react";
import { Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { deleteAccountAction, type AccountState } from "./account-actions";

export function DeleteAccount({
  email,
  ownsWorkspaces,
}: {
  email: string;
  ownsWorkspaces: string[];
}) {
  const [state, action, pending] = useActionState(deleteAccountAction, {} as AccountState);
  const [confirm, setConfirm] = useState("");
  return (
    <section className="space-y-3 rounded-lg border border-destructive/40 p-4">
      <h2 className="text-base font-semibold tracking-tight text-destructive">
        Delete your account
      </h2>
      <p className="text-sm text-muted-foreground">
        Removes your sign-in, sessions and memberships. Bookings you hosted stay with the workspace;
        your name on them does not change.
      </p>
      {ownsWorkspaces.length > 0 ? (
        <p className="text-sm text-muted-foreground">
          You own {ownsWorkspaces.join(", ")}. Delete the workspace under Settings, or make someone
          else the owner, before deleting your account.
        </p>
      ) : (
        <form action={action} className="space-y-3">
          <Field>
            <FieldLabel htmlFor="confirm-account">Type your email to confirm</FieldLabel>
            <Input
              id="confirm-account"
              name="confirm"
              autoComplete="off"
              placeholder={email}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="max-w-xs"
            />
          </Field>
          {state.error && <p className="text-sm text-destructive">{state.error}</p>}
          <Button
            type="submit"
            variant="destructive"
            disabled={pending || confirm.trim().toLowerCase() !== email.toLowerCase()}
          >
            <Trash2Icon data-icon="inline-start" />
            {pending ? "Deleting…" : "Delete my account"}
          </Button>
        </form>
      )}
    </section>
  );
}
