"use client";

import { toast } from "sonner";
import { ActionButton } from "@/components/action-button";
import { setGuestRepliesAction } from "../actions";

/** Turns guests' replies to the timeline on or off for the workspace. */
export function GuestRepliesToggle({ on }: { on: boolean }) {
  return (
    <ActionButton
      variant={on ? "outline" : "default"}
      pendingText="Working…"
      action={async () => {
        const r = await setGuestRepliesAction(!on);
        if (r.error) toast.error(r.error);
        else
          toast.success(
            on ? "Replies now go to your own address" : "Replies now land on the timeline",
          );
      }}
    >
      {on ? "Turn off" : "Turn on"}
    </ActionButton>
  );
}
