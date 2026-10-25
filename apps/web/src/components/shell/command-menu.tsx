"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { Autocomplete } from "@base-ui/react/autocomplete";
import { Dialog } from "@base-ui/react/dialog";
import {
  BellIcon,
  CornerDownLeftIcon,
  ExternalLinkIcon,
  SearchIcon,
  SettingsIcon,
  UserRoundIcon,
  type LucideIcon,
} from "lucide-react";
import { searchContactsAction, type JumpContact } from "@/app/(admin)/admin/search-actions";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";
import { navPages, type NavOptions } from "./nav";

type JumpItem = {
  id: string;
  label: string;
  /** Muted, on the right: the nav group, or a contact's company and email. */
  detail?: string;
  href: string;
  icon: LucideIcon;
  external?: boolean;
  keywords?: string;
};
type JumpGroup = { value: string; items: JumpItem[] };

const subscribe = () => () => {};
/** "⌘" on Apple keyboards, "Ctrl" elsewhere; "⌘" while rendering on the server. */
export function useModKey() {
  return useSyncExternalStore(
    subscribe,
    () => (/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? "⌘" : "Ctrl"),
    () => "⌘",
  );
}

const SETTINGS: [string, string][] = [
  ["/admin/settings", "Workspace settings"],
  ["/admin/settings/integrations", "Integrations"],
  ["/admin/settings/api", "API keys and webhooks"],
  ["/admin/settings/data", "Privacy, export and activity"],
  ["/admin/settings/branding", "Brand & communications"],
  ["/admin/settings/emails", "Emails"],
];

function jumpGroups(nav: NavOptions, bookingPageHref?: string | null): JumpGroup[] {
  const pages = navPages(nav).map(({ item, solution }) => ({
    id: `page:${item.href}`,
    label: item.label,
    detail: solution === "hiring" ? "Hiring" : undefined,
    href: item.href,
    icon: item.icon,
    keywords: item.keywords,
  }));
  const you: JumpItem[] = [
    {
      id: "you:account",
      label: "Account",
      href: "/admin/account",
      icon: UserRoundIcon,
      keywords: "password passkey sign-in",
    },
    ...(nav.collaborator
      ? []
      : [
          {
            id: "you:notifications",
            label: "Notifications",
            href: "/admin/notifications",
            icon: BellIcon,
          },
        ]),
    ...(bookingPageHref
      ? [
          {
            id: "you:page",
            label: "Your booking page",
            href: bookingPageHref,
            icon: ExternalLinkIcon,
            external: true,
            keywords: "public link share",
          },
        ]
      : []),
  ];
  const settings: JumpItem[] = nav.manager
    ? SETTINGS.map(([href, label]) => ({
        id: `settings:${href}`,
        label,
        detail: "Settings",
        href,
        icon: SettingsIcon,
      }))
    : [];
  return [
    { value: "Pages", items: pages },
    ...(settings.length ? [{ value: "Settings", items: settings }] : []),
    { value: "You", items: you },
  ];
}

const asString = (it: JumpItem) => [it.label, it.detail, it.keywords].filter(Boolean).join(" ");

/**
 * Search-or-jump (⌘K / Ctrl K): every page the member can open, the settings tabs, their own
 * things, and the workspace's contacts by name, email or company. The top bar shows it as a
 * search field on wide screens and a search button on a phone.
 */
export function CommandMenu({
  nav,
  bookingPageHref,
}: {
  nav: NavOptions;
  bookingPageHref?: string | null;
}) {
  const router = useRouter();
  const mod = useModKey();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [contacts, setContacts] = useState<JumpContact[]>([]);
  const [searching, startSearch] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const latest = useRef("");
  // Focus lands in the field on open, so typing right after ⌘K is never lost.
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setQuery("");
      setContacts([]);
      latest.current = "";
    }
  };

  const onQuery = (q: string) => {
    setQuery(q);
    latest.current = q;
    clearTimeout(timer.current);
    if (nav.collaborator || q.trim().length < 2) {
      setContacts([]);
      return;
    }
    timer.current = setTimeout(() => {
      startSearch(async () => {
        const found = await searchContactsAction(q);
        if (latest.current === q) setContacts(found);
      });
    }, 150);
  };

  const groups = jumpGroups(nav, bookingPageHref);
  const people: JumpItem[] = contacts.map((c) => ({
    id: `contact:${c.id}`,
    label: c.name,
    detail: c.detail,
    href: `/admin/contacts/${c.id}`,
    icon: UserRoundIcon,
  }));
  const items = people.length ? [{ value: "Contacts", items: people }, ...groups] : groups;

  const go = (it: JumpItem) => {
    onOpenChange(false);
    if (it.external) window.open(it.href, "_blank", "noopener");
    else router.push(it.href);
  };

  const placeholder = nav.collaborator ? "Jump to…" : "Search or jump to…";
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden h-9 w-full max-w-sm items-center gap-2 rounded-lg border bg-card px-3 text-sm text-muted-foreground shadow-xs outline-none hover:border-foreground/20 focus-visible:ring-3 focus-visible:ring-ring/50 md:flex"
      >
        <SearchIcon className="size-4 shrink-0" aria-hidden />
        <span className="flex-1 truncate text-left">{placeholder}</span>
        <Kbd aria-hidden>
          {mod}
          {mod === "Ctrl" ? " " : ""}K
        </Kbd>
        <span className="sr-only">({mod === "⌘" ? "Command" : "Control"} K)</span>
      </button>
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        aria-label={placeholder.replace("…", "")}
        onClick={() => setOpen(true)}
      >
        <SearchIcon className="size-[18px]" />
      </Button>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/25 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 motion-reduce:transition-none" />
        <Dialog.Viewport className="fixed inset-0 z-50 flex items-start justify-center px-3 pt-[12vh] pb-3">
          <Dialog.Popup
            aria-label="Search or jump"
            initialFocus={input}
            className="flex max-h-[min(34rem,calc(100dvh-6rem))] w-full max-w-xl flex-col overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-2xl transition-[opacity,scale] duration-150 outline-none data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0 motion-reduce:transition-none"
          >
            <Autocomplete.Root
              open
              inline
              items={items}
              value={query}
              onValueChange={onQuery}
              itemToStringValue={asString}
              autoHighlight="always"
              keepHighlight
            >
              <div className="flex items-center gap-2.5 border-b px-4">
                <SearchIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <Autocomplete.Input
                  ref={input}
                  // Opened from a plain button (not a Dialog.Trigger), the dialog leaves focus
                  // on the page; the field takes it as it mounts.
                  autoFocus
                  aria-label={placeholder.replace("…", "")}
                  placeholder={
                    nav.collaborator ? "Type a page name" : "Type a page, setting or contact"
                  }
                  className="h-12 w-full border-0 bg-transparent text-base outline-none placeholder:text-muted-foreground sm:text-sm"
                />
                <Dialog.Close
                  render={
                    <Button
                      variant="outline"
                      size="xs"
                      className="font-medium text-muted-foreground"
                    />
                  }
                >
                  Esc<span className="sr-only"> to close</span>
                </Dialog.Close>
              </div>
              <div className="min-h-0 flex-1 [scroll-padding-block:0.5rem] overflow-y-auto overscroll-contain p-2">
                <Autocomplete.Status className="sr-only">
                  {searching ? "Searching contacts…" : ""}
                </Autocomplete.Status>
                <Autocomplete.Empty>
                  <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                    {searching ? "Searching…" : `Nothing matches “${query.trim()}”.`}
                  </p>
                </Autocomplete.Empty>
                <Autocomplete.List>
                  {(group: JumpGroup) => (
                    <Autocomplete.Group
                      key={group.value}
                      items={group.items}
                      className="not-last:mb-2"
                    >
                      <Autocomplete.GroupLabel className="px-3 pt-1 pb-1.5 text-xs font-medium text-muted-foreground">
                        {group.value}
                      </Autocomplete.GroupLabel>
                      <Autocomplete.Collection>
                        {(it: JumpItem) => (
                          <Autocomplete.Item
                            key={it.id}
                            value={it}
                            onClick={() => go(it)}
                            className={cn(
                              "group flex h-10 cursor-pointer items-center gap-3 rounded-lg px-3 text-sm outline-none select-none",
                              "data-highlighted:bg-accent data-highlighted:text-accent-foreground",
                            )}
                          >
                            <it.icon
                              className="size-4 shrink-0 text-muted-foreground group-data-highlighted:text-accent-foreground"
                              aria-hidden
                            />
                            <span className="min-w-0 flex-1 truncate font-medium">{it.label}</span>
                            {it.detail && (
                              <span className="max-w-[45%] truncate text-xs text-muted-foreground group-data-highlighted:text-accent-foreground">
                                {it.detail}
                              </span>
                            )}
                            {it.external && <span className="sr-only">(opens in a new tab)</span>}
                          </Autocomplete.Item>
                        )}
                      </Autocomplete.Collection>
                    </Autocomplete.Group>
                  )}
                </Autocomplete.List>
              </div>
              <div className="hidden items-center gap-4 border-t px-4 py-2.5 text-xs text-muted-foreground sm:flex">
                <span className="flex items-center gap-1.5">
                  <Kbd>↑</Kbd>
                  <Kbd>↓</Kbd> to move
                </span>
                <span className="flex items-center gap-1.5">
                  <Kbd>
                    <CornerDownLeftIcon className="size-3" aria-label="Enter" />
                  </Kbd>{" "}
                  to open
                </span>
                <span className="flex items-center gap-1.5">
                  <Kbd>Esc</Kbd> to close
                </span>
              </div>
            </Autocomplete.Root>
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
