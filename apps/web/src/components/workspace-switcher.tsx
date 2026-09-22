"use client";

import Link from "next/link";
import {
  BuildingIcon,
  CheckIcon,
  ChevronsUpDownIcon,
  LayoutGridIcon,
  PlusIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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

/**
 * Current workspace name in the admin header. In cloud mode it is a menu that switches between
 * the user's workspaces and links to the chooser and to creating a new one.
 */
export function WorkspaceSwitcher({
  current,
  workspaces,
  allUrl,
  newUrl,
}: {
  current: { id: string; name: string };
  /** Undefined outside cloud mode: render the plain name. */
  workspaces?: SwitcherWorkspace[];
  allUrl?: string;
  newUrl?: string;
}) {
  if (!workspaces)
    return (
      <Link href="/admin" className="font-semibold tracking-tight">
        {current.name}
      </Link>
    );
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2 gap-1.5 font-semibold tracking-tight"
            aria-label={`Workspace: ${current.name}. Switch workspace`}
          />
        }
      >
        <BuildingIcon className="size-4 text-muted-foreground" aria-hidden />
        <span className="max-w-48 truncate">{current.name}</span>
        <ChevronsUpDownIcon className="size-3.5 text-muted-foreground" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-xs text-muted-foreground">
            Workspaces
          </DropdownMenuLabel>
          {workspaces.map((w) => (
            <DropdownMenuItem key={w.id} onClick={() => window.location.assign(w.url)}>
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
          <DropdownMenuItem onClick={() => window.location.assign(allUrl)}>
            <LayoutGridIcon aria-hidden />
            All workspaces
          </DropdownMenuItem>
        )}
        {newUrl && (
          <DropdownMenuItem onClick={() => window.location.assign(newUrl)}>
            <PlusIcon aria-hidden />
            New workspace
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
