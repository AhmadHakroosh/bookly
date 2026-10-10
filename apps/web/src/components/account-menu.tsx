"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { ChevronDownIcon, LogOutIcon, UserRoundIcon } from "lucide-react";
import { BusyOverlay } from "@/components/busy-overlay";
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

/**
 * The signed-in person's menu in the admin header: the account page (sign-in methods,
 * passkeys, password, deletion) and sign-out. Workspace things stay in the sidebar.
 */
export function AccountMenu({
  email,
  name,
  signOut,
}: {
  email: string;
  name: string;
  signOut: () => Promise<void>;
}) {
  // Signing out ends with a redirect; the page stays covered until it lands.
  const [leaving, setLeaving] = useState(false);
  const [, start] = useTransition();
  return (
    <>
      <BusyOverlay show={leaving} label="Signing out…" />
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" className="gap-1.5" aria-label={`Account: ${email}`} />}
        >
          <UserRoundIcon className="size-4 text-muted-foreground" aria-hidden />
          <span className="hidden max-w-48 truncate text-sm md:inline">{email}</span>
          <ChevronDownIcon className="size-3.5 text-muted-foreground" aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="font-normal">
              <span className="block truncate text-sm font-medium">{name}</span>
              <span className="block truncate text-xs text-muted-foreground">{email}</span>
            </DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem render={<Link href="/admin/account" />}>
            <UserRoundIcon className="size-4" aria-hidden />
            Account
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => {
              setLeaving(true);
              start(() => signOut());
            }}
          >
            <LogOutIcon className="size-4" aria-hidden />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
