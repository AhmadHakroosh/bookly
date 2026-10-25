"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ChevronDownIcon, EyeIcon } from "lucide-react";
import type { StageCategory } from "@bookly/db/schema";
import {
  clearFlagAction,
  showAccommodationsAction,
} from "@/app/(admin)/admin/hiring/opportunities/actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useMove } from "./move";

/**
 * The stage chip with a dropdown in the candidate pane's header (hiring.png, Peach "Interview ▾").
 * Open stages only: outcomes come from decisions.
 */
export function StageMenu({
  opportunityId,
  applicationId,
  current,
  stages,
}: {
  opportunityId: string;
  applicationId: string;
  current: { id: string; name: string } | null;
  stages: { id: string; name: string; category: StageCategory }[];
}) {
  const { move, dialog, busy } = useMove(opportunityId);
  const open = stages.filter((s) => s.category === "open");
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              className="bg-accent text-accent-foreground"
              aria-label={`Stage: ${current?.name ?? "none"}. Change stage`}
            />
          }
        >
          {current?.name ?? "No stage"}
          <ChevronDownIcon data-icon="inline-end" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Move to</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={current?.id ?? ""}
              onValueChange={(id) => {
                const to = open.find((s) => s.id === id);
                if (to && to.id !== current?.id) move([applicationId], to.id, to.name);
              }}
            >
              {open.map((s) => (
                <DropdownMenuRadioItem key={s.id} value={s.id} closeOnClick>
                  {s.name}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <p className="max-w-56 px-2 py-1.5 text-xs text-muted-foreground">
            Outcomes are recorded as decisions.
          </p>
        </DropdownMenuContent>
      </DropdownMenu>
      {dialog}
    </>
  );
}

/** Clears a requirement flag once a person has looked; the server audits who cleared what. */
export function ClearFlag({
  applicationId,
  requirement,
}: {
  applicationId: string;
  requirement: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      size="xs"
      variant="ghost"
      disabled={pending}
      aria-label={`Clear the flag "Doesn't meet: ${requirement}"`}
      onClick={() =>
        start(async () => {
          const r = await clearFlagAction(applicationId, requirement);
          if (r.error) toast.error(r.error);
          else toast.success("Flag cleared");
          router.refresh();
        })
      }
    >
      Clear
    </Button>
  );
}

/**
 * Adjustments someone asked for stay hidden until a coordinator chooses to read them; each read
 * is in the activity log, which the button says.
 */
export function AccommodationsReveal({ applicationId }: { applicationId: string }) {
  const [text, setText] = useState<string | null | undefined>(undefined);
  const [pending, start] = useTransition();
  if (text !== undefined)
    return (
      <p className="text-sm whitespace-pre-wrap" aria-live="polite">
        {text || "Nothing to show."}
      </p>
    );
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await showAccommodationsAction(applicationId);
            if (r.error) toast.error(r.error);
            else setText(r.text ?? null);
          })
        }
      >
        <EyeIcon data-icon="inline-start" />
        Show
      </Button>
      <span className="text-xs text-muted-foreground">
        Viewing is recorded in the activity log.
      </span>
    </div>
  );
}
