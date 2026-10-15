"use client";

import { useActionState } from "react";
import { joinWaitlistAction, type WaitlistState } from "./actions";
import { SubmitButton } from "@/components/submit-button";

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
  const [state, action] = useActionState(joinWaitlistAction, {} as WaitlistState);
  const field =
    "bg-background h-10 w-full rounded-lg border px-3 text-sm outline-none focus-visible:ring-2";
  if (state.ok)
    return (
      <p className="rounded-lg border p-4 text-sm" role="status">
        You&apos;re on the list. We&apos;ll email you the moment a spot opens.
      </p>
    );
  return (
    <form
      action={action}
      className="space-y-4"
      toolname="join_waitlist"
      tooldescription="Put the guest on the waiting list for this event type when the wanted day or time is full; they are emailed the moment a spot opens."
    >
      <input
        type="hidden"
        name="username"
        value={username}
        toolparamdescription="The host's username (fixed by the page)."
      />
      <input
        type="hidden"
        name="event"
        value={event}
        toolparamdescription="The event type slug (fixed by the page)."
      />
      <input
        type="hidden"
        name="target"
        value={target}
        toolparamdescription="The wanted day or start time (fixed by the page)."
      />
      <input
        type="hidden"
        name="tz"
        value={tz}
        toolparamdescription="The guest's IANA timezone (fixed by the page)."
      />
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        className="hidden"
        aria-hidden
        toolparamdescription="Leave empty. This field catches bots; any value rejects the request."
      />
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Name</span>
        <input
          name="name"
          required
          autoComplete="name"
          className={field}
          toolparamdescription="The guest's full name."
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Email</span>
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          className={field}
          toolparamdescription="The guest's email address, where the opening is announced."
        />
      </label>
      {state.error && (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      )}
      <SubmitButton className="h-10 w-full" pendingText="Joining…">
        Notify me
      </SubmitButton>
    </form>
  );
}
