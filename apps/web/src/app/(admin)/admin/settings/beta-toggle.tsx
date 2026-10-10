"use client";

import { toast } from "sonner";
import { ActionButton } from "@/components/action-button";
import { setBetaOptOut } from "./beta-actions";

export function BetaToggle({ optedOut }: { optedOut: boolean }) {
  return (
    <ActionButton
      variant="outline"
      pendingText="Working…"
      action={async () => {
        const r = await setBetaOptOut(!optedOut);
        if (r.error) toast.error(r.error);
        else
          toast.success(optedOut ? "Betas on for this workspace" : "Betas off for this workspace");
      }}
    >
      {optedOut ? "Take part in betas" : "Opt out of betas"}
    </ActionButton>
  );
}
