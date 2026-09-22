"use client";

import type { ComponentProps, ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

/**
 * A submit button that knows when its form is in flight: it disables itself, shows a spinner
 * and optionally swaps its label. Works with server-action forms and useActionState alike.
 */
export function SubmitButton({
  children,
  pendingText,
  disabled,
  ...props
}: ComponentProps<typeof Button> & { pendingText?: ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" aria-busy={pending} disabled={pending || disabled} {...props}>
      {pending && <Spinner data-icon="inline-start" />}
      {pending && pendingText ? pendingText : children}
    </Button>
  );
}
