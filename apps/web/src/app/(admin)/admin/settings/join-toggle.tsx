"use client";

import { toast } from "sonner";
import { ActionButton } from "@/components/action-button";
import { disableJoinNotifications, enableJoinNotifications } from "./actions";

export function JoinToggle({ enabled }: { enabled: boolean }) {
  return (
    <ActionButton
      variant={enabled ? "outline" : "default"}
      pendingText="Working…"
      action={async () => {
        const r = enabled ? await disableJoinNotifications() : await enableJoinNotifications();
        if (r.error) toast.error(r.error);
        else toast.success(enabled ? "Join notifications off" : "Join notifications on");
      }}
    >
      {enabled ? "Turn off" : "Turn on"}
    </ActionButton>
  );
}
