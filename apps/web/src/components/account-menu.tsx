"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useTheme } from "next-themes";
import {
  BellIcon,
  ChevronDownIcon,
  ExternalLinkIcon,
  LogOutIcon,
  MonitorIcon,
  MoonIcon,
  SunIcon,
  UserRoundIcon,
} from "lucide-react";
import { BusyOverlay } from "@/components/busy-overlay";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initialsOf } from "@/components/ui/avatar-stack";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * The signed-in person's menu at the end of the top bar: their account (sign-in methods,
 * passkeys, password, deletion), their notification settings, their public booking page, the
 * theme, and sign-out. Workspace things stay in the sidebar.
 */
export function AccountMenu({
  email,
  name,
  image,
  bookingPageHref,
  signOut,
}: {
  email: string;
  name: string;
  image?: string | null;
  /** The member's public page, when they have one. */
  bookingPageHref?: string | null;
  signOut: () => Promise<void>;
}) {
  // Signing out ends with a redirect; the page stays covered until it lands.
  const [leaving, setLeaving] = useState(false);
  const [, start] = useTransition();
  const { theme, setTheme } = useTheme();
  return (
    <>
      <BusyOverlay show={leaving} label="Signing out…" />
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" className="gap-1.5 px-1.5" aria-label={`Account: ${email}`} />
          }
        >
          <Avatar size="sm" className="size-7" aria-hidden>
            {image && <AvatarImage src={image} alt="" />}
            <AvatarFallback className="bg-accent text-xs font-semibold text-accent-foreground">
              {initialsOf(name || email)}
            </AvatarFallback>
          </Avatar>
          <ChevronDownIcon className="size-3.5 text-muted-foreground" aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="font-normal">
              <span className="block truncate text-sm font-medium text-foreground">{name}</span>
              <span className="block truncate text-xs text-muted-foreground">{email}</span>
            </DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem render={<Link href="/admin/account" />}>
            <UserRoundIcon className="size-4" aria-hidden />
            Account
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link href="/admin/notifications" />}>
            <BellIcon className="size-4" aria-hidden />
            Notifications
          </DropdownMenuItem>
          {bookingPageHref && (
            <DropdownMenuItem
              render={<a href={bookingPageHref} target="_blank" rel="noreferrer" />}
            >
              <ExternalLinkIcon className="size-4" aria-hidden />
              Your booking page
              <span className="sr-only">(opens in a new tab)</span>
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel className="text-xs text-muted-foreground">Theme</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={theme ?? "system"} onValueChange={(v) => setTheme(v)}>
              <DropdownMenuRadioItem value="light">
                <SunIcon className="size-4" aria-hidden />
                Light
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark">
                <MoonIcon className="size-4" aria-hidden />
                Dark
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="system">
                <MonitorIcon className="size-4" aria-hidden />
                System
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuGroup>
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
