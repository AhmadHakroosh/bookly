"use client";

import { useTransition } from "react";
import { MoreVerticalIcon } from "lucide-react";
import { toast } from "sonner";
import { Dropdown } from "@/components/dropdown";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/*
 * The contact header's controls (`ui mocks.png` 03): the stage as a chip beside the name (choose
 * another and it saves), and ⋮ with the rest. The actions come bound from the page.
 */

const TONE: Record<string, string> = {
  won: "border-success/30 bg-success-muted text-success",
  lost: "border-border bg-muted text-muted-foreground",
  open: "border-info/30 bg-info-muted text-info",
  hold: "border-warning/30 bg-warning-muted text-warning",
};

export function StageChip({
  stage,
  category,
  choices,
  change,
}: {
  stage: string;
  category: string;
  choices: { key: string; name: string }[];
  change: (form: FormData) => Promise<void>;
}) {
  const [pending, start] = useTransition();
  return (
    <Dropdown
      // Remounts after a save: the picker is uncontrolled and its default moves.
      key={stage}
      name="stage"
      ariaLabel="Stage"
      size="sm"
      disabled={pending}
      defaultValue={stage}
      options={choices.map((s) => ({ value: s.key, label: s.name }))}
      onValueChange={(v) =>
        start(async () => {
          const f = new FormData();
          f.set("stage", v);
          await change(f);
          toast.success(`Moved to ${choices.find((c) => c.key === v)?.name ?? v}`);
        })
      }
      className={`h-7 w-auto gap-1 rounded-full border px-2.5 text-xs font-medium ${TONE[category] ?? TONE.open}`}
    />
  );
}

export function ContactMenu({
  optedOut,
  toggleOptOut,
  links,
}: {
  optedOut: boolean;
  toggleOptOut: () => Promise<void>;
  links: { href: string; label: string }[];
}) {
  const [pending, start] = useTransition();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon" disabled={pending} aria-label="More actions" />}
      >
        <MoreVerticalIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {links.map((l) => (
          <DropdownMenuItem key={l.href} render={<a href={l.href} />}>
            {l.label}
          </DropdownMenuItem>
        ))}
        <DropdownMenuItem
          onClick={() =>
            start(async () => {
              await toggleOptOut();
              toast.success(optedOut ? "Emails are back on" : "Opted out of emails");
            })
          }
        >
          {optedOut ? "Opt back in to emails" : "Opt out of emails"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
