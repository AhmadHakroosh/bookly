"use client";

import { useTransition } from "react";
import { MoreVerticalIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { disconnect, reloadCalendars, startConnect } from "../integrations-actions";

/** ⋮ on a connected tool: reconnect, reload a calendar's list, disconnect. */
export function ConnectionMenu({
  provider,
  name,
  reload = false,
}: {
  provider: "google" | "microsoft" | "zoom";
  /** "Google Calendar": names the menu and the toasts. */
  name: string;
  /** Calendars only: fetch the account's calendar list again. */
  reload?: boolean;
}) {
  const [pending, start] = useTransition();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={pending}
            aria-label={`${name} options`}
          />
        }
      >
        <MoreVerticalIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={() => start(() => startConnect(provider, "/admin/calendars"))}>
          Reconnect
        </DropdownMenuItem>
        {reload && (provider === "google" || provider === "microsoft") && (
          <DropdownMenuItem
            onClick={() =>
              start(async () => {
                await reloadCalendars(provider);
                toast.success("Calendar list reloaded");
              })
            }
          >
            Reload calendar list
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onClick={() =>
            start(async () => {
              await disconnect(provider);
              toast.success(`${name} disconnected`);
            })
          }
        >
          Disconnect
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
