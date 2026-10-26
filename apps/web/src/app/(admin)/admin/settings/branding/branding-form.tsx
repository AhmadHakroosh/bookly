"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { SubmitButton } from "@/components/submit-button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ColorPicker } from "@/components/color-picker";
import { ImageUpload } from "@/components/image-upload";
import { updateWorkspaceSettings, type SettingsState } from "../actions";
import { removeLogoAction, uploadLogoAction } from "./logo-actions";

export function BrandingForm({
  workspace,
  allowed,
  uploads = false,
}: {
  workspace: { logoUrl: string; accent: string };
  /** Custom logo and colour come with the plans that remove Bookly branding. */
  allowed: boolean;
  /** The `file_uploads` flag: show the upload control next to the URL field. */
  uploads?: boolean;
}) {
  const [state, action] = useActionState(updateWorkspaceSettings, {} as SettingsState);
  const [logoUrl, setLogoUrl] = useState(workspace.logoUrl);
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
            <Link
              href="/admin/billing"
              className="underline decoration-current/40 underline-offset-4 hover:decoration-current"
            >
              See plans
            </Link>
          </p>
        )}
        <fieldset disabled={!allowed} className="contents">
          {uploads && (
            <Field>
              <FieldLabel>Logo</FieldLabel>
              <ImageUpload
                initial={workspace.logoUrl}
                onChange={setLogoUrl}
                upload={uploadLogoAction}
                remove={removeLogoAction}
                shape="square"
                label="Logo"
                hint="PNG, JPEG, WebP, GIF or AVIF up to 8 MB; transparency is kept."
                disabled={!allowed}
              />
            </Field>
          )}
          <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
            <Field>
              <FieldLabel htmlFor="logoUrl">{uploads ? "Or a logo URL" : "Logo URL"}</FieldLabel>
              <Input
                id="logoUrl"
                name="logoUrl"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
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
