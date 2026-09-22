"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { completeSetup, type SetupState } from "./actions";

export function SetupForm({ signedIn = false }: { signedIn?: boolean }) {
  const [state, action, pending] = useActionState(completeSetup, {} as SetupState);
  const err = (k: string) => state.fields?.[k]?.map((message) => ({ message }));
  return (
    <form action={action} className="space-y-8">
      <FieldSet>
        <FieldLegend>Your workspace</FieldLegend>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="workspaceName">Workspace name</FieldLabel>
            <Input
              id="workspaceName"
              name="workspaceName"
              required
              placeholder="Jane Doe"
              aria-invalid={!!state.fields?.workspaceName}
            />
            <FieldError errors={err("workspaceName")} />
          </Field>
        </FieldGroup>
      </FieldSet>
      {!signedIn && (
        <FieldSet>
          <FieldLegend>Owner account</FieldLegend>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="name">Your name</FieldLabel>
              <Input
                id="name"
                name="name"
                required
                autoComplete="name"
                aria-invalid={!!state.fields?.name}
              />
              <FieldError errors={err("name")} />
            </Field>
            <Field>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                aria-invalid={!!state.fields?.email}
              />
              <FieldError errors={err("email")} />
            </Field>
            <Field>
              <FieldLabel htmlFor="password">Password</FieldLabel>
              <Input
                id="password"
                name="password"
                type="password"
                required
                minLength={10}
                autoComplete="new-password"
                aria-invalid={!!state.fields?.password}
              />
              <FieldError errors={err("password")} />
            </Field>
          </FieldGroup>
        </FieldSet>
      )}
      {state.error && !state.fields && (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Creating…" : "Create workspace"}
      </Button>
    </form>
  );
}
