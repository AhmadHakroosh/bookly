"use client";

import { useActionState } from "react";
import { joinWaitlistAction, type WaitlistState } from "./actions";

export function WaitlistForm({
  username,
  event,
  target,
  tz,
}: {
  username: string;
  event: string;
  /** ISO start of a full session, or YYYY-MM-DD for "any time that day". */
  target: string;
  tz: string;
}) {
  const [state, action, pending] = useActionState(joinWaitlistAction, {} as WaitlistState);
  const field =
    "bg-background h-10 w-full rounded-lg border px-3 text-sm outline-none focus-visible:ring-2";
  if (state.ok)
    return (
      <p className="rounded-lg border p-4 text-sm" role="status">
        You&apos;re on the list. We&apos;ll email you the moment a spot opens.
      </p>
    );
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="username" value={username} />
      <input type="hidden" name="event" value={event} />
      <input type="hidden" name="target" value={target} />
      <input type="hidden" name="tz" value={tz} />
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        className="hidden"
        aria-hidden
      />
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Name</span>
        <input name="name" required autoComplete="name" className={field} />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Email</span>
        <input name="email" type="email" required autoComplete="email" className={field} />
      </label>
      {state.error && (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="h-10 w-full rounded-lg bg-primary text-sm font-medium text-primary-foreground disabled:opacity-60"
      >
        {pending ? "Joining…" : "Notify me"}
      </button>
    </form>
  );
}
