"use client";

import Link from "next/link";
import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { SubmitButton } from "@/components/submit-button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ColorPicker } from "@/components/color-picker";
import { updateWorkspaceSettings, type SettingsState } from "../actions";

export function BrandingForm({
  workspace,
  allowed,
}: {
  workspace: { logoUrl: string; accent: string };
  /** Custom logo and colour come with the plans that remove Bookly branding. */
  allowed: boolean;
}) {
  const [state, action] = useActionState(updateWorkspaceSettings, {} as SettingsState);
  useEffect(() => {
    if (state.ok) toast.success("Branding saved");
    else if (state.error && !state.fields) toast.error(state.error);
  }, [state]);
  const err = (k: string) => state.fields?.[k]?.map((message) => ({ message }));
  return (
    <form action={action}>
      <input type="hidden" name="section" value="branding" />
      <FieldGroup>
        {!allowed && (
          <p className="rounded-md border border-(--brand)/40 bg-(--brand)/10 p-3 text-sm">
            Your own logo and colour on booking pages and emails, and no “Powered by Bookly” line,
            come with Pro and Team.{" "}
            <Link href="/admin/billing" className="underline underline-offset-4">
              See plans
            </Link>
          </p>
        )}
        <fieldset disabled={!allowed} className="contents">
          <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
            <Field>
              <FieldLabel htmlFor="logoUrl">Logo URL</FieldLabel>
              <Input
                id="logoUrl"
                name="logoUrl"
                type="url"
                defaultValue={workspace.logoUrl}
                placeholder="https://yourdomain.com/logo.png"
              />
              <FieldDescription>
                Square PNG or JPG, at least 112×112, on a public URL.
              </FieldDescription>
              <FieldError errors={err("logoUrl")} />
            </Field>
            <Field>
              <FieldLabel htmlFor="accent">Accent colour</FieldLabel>
              <div className="flex items-center gap-2">
                <ColorPicker
                  id="accent"
                  name="accent"
                  defaultValue={workspace.accent}
                  ariaLabel="Accent colour"
                  placeholder="Bookly accent"
                />
              </div>
              <FieldError errors={err("accent")} />
            </Field>
          </div>
          <SubmitButton pendingText="Saving…" disabled={!allowed}>
            Save
          </SubmitButton>
        </fieldset>
      </FieldGroup>
    </form>
  );
}
