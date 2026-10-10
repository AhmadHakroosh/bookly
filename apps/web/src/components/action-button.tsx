"use client";

import { useTransition, type ComponentProps, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

/**
 * A button that runs a server action (or any async work) on click and shows it in flight:
 * disabled with a spinner and an optional pending label. The non-form counterpart of
 * SubmitButton, so every click that reaches the server looks the same while it waits.
 */
export function ActionButton({
  action,
  children,
  pendingText,
  disabled,
  ...props
}: Omit<ComponentProps<typeof Button>, "onClick" | "type"> & {
  action: () => Promise<unknown> | unknown;
  pendingText?: ReactNode;
}) {
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      aria-busy={pending}
      disabled={pending || disabled}
      onClick={() => start(async () => void (await action()))}
      {...props}
    >
      {pending && <Spinner data-icon="inline-start" />}
      {pending && pendingText ? pendingText : children}
    </Button>
  );
}
