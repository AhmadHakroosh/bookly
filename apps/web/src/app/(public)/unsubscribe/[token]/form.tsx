"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { unsubscribe, type UnsubscribeState } from "./actions";

export function UnsubscribeForm({ token, email }: { token: string; email: string }) {
  const [state, action, pending] = useActionState(
    unsubscribe.bind(null, token),
    {} as UnsubscribeState,
  );
  if (state.ok)
    return (
      <p className="mt-3 text-muted-foreground" role="status">
        Done. {email} will not get proposals, payment requests or follow-ups by email any more.
      </p>
    );
  return (
    <form action={action} className="mt-3 space-y-3">
      <p className="text-muted-foreground">
        Stop emails like proposals, payment requests and follow-ups to <strong>{email}</strong>?
        Booking confirmations and reminders for meetings you book are not affected.
      </p>
      {state.error && (
        <p className="text-destructive" role="alert">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Unsubscribe"}
      </Button>
    </form>
  );
}
