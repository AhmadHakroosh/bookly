"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { disableJoinNotifications, enableJoinNotifications } from "./actions";

export function JoinToggle({ enabled }: { enabled: boolean }) {
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      variant={enabled ? "outline" : "default"}
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = enabled ? await disableJoinNotifications() : await enableJoinNotifications();
          if (r.error) toast.error(r.error);
          else toast.success(enabled ? "Join notifications off" : "Join notifications on");
        })
      }
    >
      {pending ? "Working…" : enabled ? "Turn off" : "Turn on"}
    </Button>
  );
}
