"use client";

import { useState } from "react";
import {
  BookOpenIcon,
  CircleHelpIcon,
  KeyboardIcon,
  LifeBuoyIcon,
  type LucideIcon,
} from "lucide-react";
import { GitHubIcon } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Kbd } from "@/components/ui/kbd";
import { useModKey } from "./command-menu";

const SHORTCUTS: { keys: string[]; what: string }[] = [
  { keys: ["mod", "K"], what: "Search or jump to a page" },
  { keys: ["J"], what: "Next item in an open pane" },
  { keys: ["K"], what: "Previous item in an open pane" },
  { keys: ["Esc"], what: "Close the pane, menu or dialog" },
];

/**
 * Help in the top bar: the documentation, support (email on the hosted service, the issue
 * tracker when self-hosted), the source, and the keyboard shortcuts.
 */
export function HelpMenu({ supportHref }: { supportHref: string }) {
  const [shortcuts, setShortcuts] = useState(false);
  const mod = useModKey();
  const links: { href: string; label: string; icon: LucideIcon }[] = [
    { href: "/docs", label: "Documentation", icon: BookOpenIcon },
    { href: supportHref, label: "Support", icon: LifeBuoyIcon },
    {
      href: "https://github.com/AhmadHakroosh/bookly",
      label: "GitHub",
      icon: GitHubIcon as unknown as LucideIcon,
    },
  ];
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" className="gap-1.5 px-2.5" aria-label="Help" />}
        >
          <CircleHelpIcon className="size-5" aria-hidden />
          <span className="hidden text-sm font-medium lg:inline" aria-hidden>
            Help
          </span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {links.map((l) => (
            <DropdownMenuItem
              key={l.label}
              render={<a href={l.href} target="_blank" rel="noreferrer" />}
            >
              <l.icon className="size-4" aria-hidden />
              {l.label}
              <span className="sr-only">(opens in a new tab)</span>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setShortcuts(true)}>
            <KeyboardIcon className="size-4" aria-hidden />
            Keyboard shortcuts
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={shortcuts} onOpenChange={setShortcuts}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle className="text-base font-semibold">Keyboard shortcuts</DialogTitle>
          <DialogDescription>Work without the mouse anywhere in the admin.</DialogDescription>
          <dl className="divide-y rounded-lg border">
            {SHORTCUTS.map((s) => (
              <div key={s.what} className="flex items-center justify-between gap-4 px-3 py-2.5">
                <dt className="text-sm">{s.what}</dt>
                <dd className="flex shrink-0 gap-1">
                  {s.keys.map((k) => (
                    <Kbd key={k}>{k === "mod" ? mod : k}</Kbd>
                  ))}
                </dd>
              </div>
            ))}
          </dl>
        </DialogContent>
      </Dialog>
    </>
  );
}
