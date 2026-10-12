"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { SubmitButton } from "@/components/submit-button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { TimezoneField } from "@/components/timezone-field";
import { HandleField, HandleHint, useHandleCheck } from "@/components/handle-field";
import { ImageUpload } from "@/components/image-upload";
import { checkUsername, saveProfile } from "../scheduling-actions";
import { removeAvatarAction, uploadAvatarAction } from "./avatar-actions";

type Values = {
  username: string;
  displayName: string;
  bio: string;
  timezone: string;
  avatarUrl: string;
};

export function ProfileForm({
  initial,
  saved,
  zones,
  uploads = false,
}: {
  initial: Values;
  /** A profile exists, so the initial username is its own and needs no availability check. */
  saved: boolean;
  zones: string[];
  /** The `file_uploads` flag: show the upload control next to the URL field. */
  uploads?: boolean;
}) {
  const [state, action] = useActionState(saveProfile, {} as { ok?: boolean; error?: string });
  const [username, setUsername] = useState(initial.username);
  const [avatarUrl, setAvatarUrl] = useState(initial.avatarUrl);
  const handle = useHandleCheck(username, "username", checkUsername, {
    initial: saved || state.ok ? initial.username : undefined,
  });
  useEffect(() => {
    if (state.ok) toast.success("Saved");
    else if (state.error) toast.error(state.error);
  }, [state]);
  return (
    <form action={action}>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="username">Username</FieldLabel>
          <HandleField
            id="username"
            name="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            status={handle.status}
          />
          <HandleHint
            status={handle.status}
            fallback={`Your page lives at /${username || "username"}. Lowercase letters, numbers and hyphens.`}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="displayName">Display name</FieldLabel>
          <Input id="displayName" name="displayName" defaultValue={initial.displayName} required />
          <FieldDescription>Shown as the host on your page and in emails.</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="bio">Bio</FieldLabel>
          <Textarea id="bio" name="bio" rows={2} defaultValue={initial.bio} />
          <FieldDescription>
            One or two sentences under your name on the booking page.
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="timezone">Your timezone</FieldLabel>
          <TimezoneField name="timezone" defaultValue={initial.timezone} zones={zones} />
          <FieldDescription>
            Where you are. Visitors see times in their own timezone automatically.
          </FieldDescription>
        </Field>
        {uploads && (
          <Field>
            <FieldLabel>Photo</FieldLabel>
            <ImageUpload
              value={avatarUrl}
              onChange={setAvatarUrl}
              upload={uploadAvatarAction}
              remove={removeAvatarAction}
              label="Photo"
              hint="PNG, JPEG, WebP, GIF or AVIF up to 8 MB; resized to 512×512."
            />
          </Field>
        )}
        <Field>
          <FieldLabel htmlFor="avatarUrl">{uploads ? "Or a photo URL" : "Avatar URL"}</FieldLabel>
          <Input
            id="avatarUrl"
            name="avatarUrl"
            value={avatarUrl}
            onChange={(e) => setAvatarUrl(e.target.value)}
            placeholder="https://…"
          />
          <FieldDescription>Link to a square image, ideally at least 256×256.</FieldDescription>
        </Field>
        <SubmitButton pendingText="Saving…" disabled={!handle.ok}>
          Save
        </SubmitButton>
      </FieldGroup>
    </form>
  );
}
