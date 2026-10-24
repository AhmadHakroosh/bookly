"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { removeLicenseAction, saveLicenseAction, type LicenseState } from "./actions";

export function LicenseForm({ hasAdminKey }: { hasAdminKey: boolean }) {
  const [state, action] = useActionState(saveLicenseAction, {} as LicenseState);
  const [removed, remove] = useActionState(removeLicenseAction, {} as LicenseState);
  const error = state.error ?? removed.error;
  return (
    <div className="space-y-3">
      <form action={action} className="space-y-3">
        <Field>
          <FieldLabel htmlFor="license-key">License key</FieldLabel>
          <Textarea
            id="license-key"
            name="key"
            rows={4}
            spellCheck={false}
            autoComplete="off"
            placeholder="bookly_lic_1.…"
            className="font-mono text-xs"
            aria-describedby="license-key-help"
          />
          <FieldDescription id="license-key-help">
            Checked on this server against Bookly&apos;s public key; nothing is sent anywhere.
            Stored encrypted.
          </FieldDescription>
        </Field>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {state.ok && (
          <p role="status" className="text-sm text-success">
            License saved.
          </p>
        )}
        <SubmitButton>Save key</SubmitButton>
      </form>
      {hasAdminKey && (
        <form action={remove}>
          <SubmitButton variant="ghost" size="sm">
            Remove the key
          </SubmitButton>
        </form>
      )}
    </div>
  );
}
