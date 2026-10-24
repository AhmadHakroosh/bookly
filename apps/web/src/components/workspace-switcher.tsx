"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckIcon, ChevronsUpDownIcon, LayoutGridIcon, PlusIcon } from "lucide-react";
import { BusyOverlay } from "@/components/busy-overlay";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type SwitcherWorkspace = {
  id: string;
  name: string;
  slug: string;
  role: string;
  url: string;
};

/** The workspace's logo, or its first letter on Ink: the square at the start of the switcher. */
function WorkspaceBadge({ name, logoUrl }: { name: string; logoUrl?: string | null }) {
  if (logoUrl)
    return (
      // eslint-disable-next-line @next/next/no-img-element -- a URL the workspace provides
      <img src={logoUrl} alt="" className="size-7 shrink-0 rounded-md bg-card object-contain" />
    );
  return (
    <span
      className="flex size-7 shrink-0 items-center justify-center rounded-md bg-ink text-sm font-semibold text-ink-foreground"
      aria-hidden
    >
      {name.trim()[0]?.toUpperCase() ?? "B"}
    </span>
  );
}

const CARD =
  "flex h-12 w-full items-center gap-2.5 rounded-xl border bg-card px-2.5 text-left text-sm font-semibold text-card-foreground shadow-xs";

/**
 * The workspace at the top of the sidebar. In cloud mode it is a menu that switches between
 * the user's workspaces and links to the chooser and to creating a new one; self-hosted, an
 * install has one workspace and this is its name.
 */
export function WorkspaceSwitcher({
  current,
  workspaces,
  allUrl,
  newUrl,
}: {
  current: { id: string; name: string; logoUrl?: string | null };
  /** Undefined outside cloud mode: render the plain name. */
  workspaces?: SwitcherWorkspace[];
  allUrl?: string;
  newUrl?: string;
}) {
  // A switch is a full navigation to another host; cover the page until it lands.
  const [going, setGoing] = useState<string | null>(null);
  const go = (url: string, label: string) => {
    setGoing(label);
    window.location.assign(url);
  };
  if (!workspaces)
    return (
      <Link
        href="/admin"
        className={cn(CARD, "outline-none focus-visible:ring-3 focus-visible:ring-ring/50")}
      >
        <WorkspaceBadge name={current.name} logoUrl={current.logoUrl} />
        <span className="min-w-0 flex-1 truncate">{current.name}</span>
      </Link>
    );
  return (
    <DropdownMenu>
      <BusyOverlay show={going !== null} label={going ?? ""} />
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            className={cn(CARD, "justify-start dark:bg-card")}
            aria-label={`Workspace: ${current.name}. Switch workspace`}
          />
        }
      >
        <WorkspaceBadge name={current.name} logoUrl={current.logoUrl} />
        <span className="min-w-0 flex-1 truncate">{current.name}</span>
        <ChevronsUpDownIcon className="size-4 text-muted-foreground" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-(--anchor-width) min-w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-xs text-muted-foreground">
            Workspaces
          </DropdownMenuLabel>
          {workspaces.map((w) => (
            <DropdownMenuItem key={w.id} onClick={() => go(w.url, `Opening ${w.name}…`)}>
              <span className="flex size-4 items-center justify-center">
                {w.id === current.id && <CheckIcon className="size-4" aria-label="Current" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate">{w.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {w.slug} · {w.role}
                </span>
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {allUrl && (
          <DropdownMenuItem onClick={() => go(allUrl, "Opening your workspaces…")}>
            <LayoutGridIcon aria-hidden />
            All workspaces
          </DropdownMenuItem>
        )}
        {newUrl && (
          <DropdownMenuItem onClick={() => go(newUrl, "Opening the signup…")}>
            <PlusIcon aria-hidden />
            New workspace
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
