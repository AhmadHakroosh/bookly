"use client";

import { useOptimistic, useTransition } from "react";
import { MoreHorizontalIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ChecklistRow } from "@/components/ui/checklist-row";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { snoozeContact, toggleTask } from "./scheduling-actions";

/*
 * Home's interactive lists (`app ui.png`): "Your next steps" ticks a task off where it is shown
 * (a contact's linked tasks use it too), and each "Keep things moving" row has its ⋯ menu. The
 * rest of Home is server-rendered.
 */

export type NextStep = {
  id: string;
  title: string;
  meta?: string;
  due?: string;
  urgent?: boolean;
  href?: string;
};

export function NextSteps({ steps, path = "/admin" }: { steps: NextStep[]; path?: string }) {
  const [done, setDone] = useOptimistic(new Set<string>(), (s, id: string) => new Set(s).add(id));
  const [, start] = useTransition();
  return (
    <ul className="divide-y">
      {steps.map((t) => (
        <li key={t.id}>
          <ChecklistRow
            title={t.title}
            meta={t.meta}
            due={t.due}
            urgent={t.urgent}
            href={t.href}
            checked={done.has(t.id)}
            onCheckedChange={(on) => {
              if (!on) return;
              start(async () => {
                setDone(t.id);
                try {
                  await toggleTask(t.id, true, path);
                } catch {
                  toast.error("That task didn't save. Try again.");
                }
              });
            }}
          />
        </li>
      ))}
    </ul>
  );
}

export function KeepMovingMenu({ contactId, name }: { contactId: string; name: string }) {
  const [pending, start] = useTransition();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={pending}
            aria-label={`More for ${name}`}
          />
        }
      >
        <MoreHorizontalIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={() =>
            start(async () => {
              await snoozeContact(contactId, 7);
              toast.success(`${name} is snoozed for a week`);
            })
          }
        >
          Snooze for a week
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
