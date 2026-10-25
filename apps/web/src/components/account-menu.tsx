"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  BellIcon,
  CalendarDaysIcon,
  ChevronDownIcon,
  ChevronsUpDownIcon,
  ExternalLinkIcon,
  LogOutIcon,
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * The signed-in person's menu: their account (sign-in methods, passkeys, password, deletion),
 * their notifications and connections, their public booking page, and sign-out. Opened from the
 * avatar at the end of the top bar and from the account card at the foot of the sidebar, as
 * `app ui.png` draws both. Light only: there is no theme choice (concept fidelity).
 */
export function AccountMenu({
  email,
  name,
  image,
  bookingPageHref,
  signOut,
  variant = "avatar",
}: {
  email: string;
  name: string;
  image?: string | null;
  /** The member's public page, when they have one. */
  bookingPageHref?: string | null;
  signOut: () => Promise<void>;
  /** `avatar` in the top bar, `card` (picture, name and email) at the foot of the sidebar. */
  variant?: "avatar" | "card";
}) {
  // Signing out ends with a redirect; the page stays covered until it lands.
  const [leaving, setLeaving] = useState(false);
  const [, start] = useTransition();
  const avatar = (size: string) => (
    <Avatar size="sm" className={size} aria-hidden>
      {image && <AvatarImage src={image} alt="" />}
      <AvatarFallback className="bg-accent text-xs font-semibold text-accent-foreground">
        {initialsOf(name || email)}
      </AvatarFallback>
    </Avatar>
  );
  return (
    <>
      <BusyOverlay show={leaving} label="Signing out…" />
      <DropdownMenu>
        {variant === "card" ? (
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                className="h-auto w-full justify-start gap-3 px-2 py-2 text-left font-normal"
              />
            }
          >
            {avatar("size-9")}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{name}</span>
              <span className="block truncate text-xs text-muted-foreground">{email}</span>
            </span>
            <ChevronsUpDownIcon className="size-4 text-muted-foreground" aria-hidden />
          </DropdownMenuTrigger>
        ) : (
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" className="gap-1.5 px-1.5" aria-label={`Account: ${email}`} />
            }
          >
            {avatar("size-7")}
            <ChevronDownIcon className="size-3.5 text-muted-foreground" aria-hidden />
          </DropdownMenuTrigger>
        )}
        <DropdownMenuContent
          align={variant === "card" ? "start" : "end"}
          side={variant === "card" ? "top" : "bottom"}
          className="w-64"
        >
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
          <DropdownMenuItem render={<Link href="/admin/calendars" />}>
            <CalendarDaysIcon className="size-4" aria-hidden />
            Calendars & conferencing
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
