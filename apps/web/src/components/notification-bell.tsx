"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import {
  AlarmClockIcon,
  AtSignIcon,
  BriefcaseIcon,
  MessagesSquareIcon,
  BanknoteIcon,
  BellIcon,
  CalendarClockIcon,
  CalendarPlusIcon,
  CalendarXIcon,
  CheckCheckIcon,
  ClockAlertIcon,
  DoorOpenIcon,
  FileTextIcon,
  ReplyIcon,
  SettingsIcon,
  UserCheckIcon,
  type LucideIcon,
} from "lucide-react";
import {
  loadNotificationsAction,
  markNotificationsReadAction,
  savePushSubscriptionAction,
} from "@/app/(admin)/admin/notifications/feed-actions";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { publishMessages } from "@/lib/messages-live";
import { currentSubscription, pushSupport, showLocal } from "@/lib/push-client";
import {
  currentTransport,
  liveState,
  onConnect,
  onTransport,
  reportSeen,
  subscribe,
} from "@/lib/realtime-client";
import { ago } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { ClientNotification } from "@/server/notifications";

const ICONS: Record<string, LucideIcon> = {
  "booking.created": CalendarPlusIcon,
  "booking.requested": CalendarClockIcon,
  "booking.cancelled": CalendarXIcon,
  "booking.reminder": AlarmClockIcon,
  "guest.joined": DoorOpenIcon,
  "recap.ready": FileTextIcon,
  "payment.received": BanknoteIcon,
  "email.replied": ReplyIcon,
  "task.assigned": UserCheckIcon,
  "task.mentioned": AtSignIcon,
  "task.overdue": ClockAlertIcon,
  "hiring.team": BriefcaseIcon,
  "message.posted": MessagesSquareIcon,
  "message.mentioned": AtSignIcon,
};

const POLL_MS = 60_000;

/**
 * The header bell: unread count, a panel with the latest notifications (mark read, mark all
 * read, show earlier) and the live feed. Notifications arrive over the tab's live connection
 * (a websocket, or Server-Sent Events as the fallback), realtime first (ADR 0007): while any tab
 * is open the server sends no push or email, so a hidden tab shows a browser notification
 * itself for the kinds the member wants on the desktop. Whatever a tab shows (visible, or as a
 * desktop notification) is reported as seen, which cancels the email held back for it.
 */
export function NotificationBell({
  initialUnread,
  pushKey,
  desktopKinds,
}: {
  initialUnread: number;
  pushKey: string | null;
  desktopKinds: string[];
}) {
  const router = useRouter();
  const [unread, setUnread] = useState(initialUnread);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<ClientNotification[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [loading, startLoading] = useTransition();
  const desktop = useRef(new Set(desktopKinds));
  useEffect(() => {
    desktop.current = new Set(desktopKinds);
  }, [desktopKinds]);

  // Keep this browser's push subscription known to the server (keys rotate; devices move).
  useEffect(() => {
    if (!pushKey || pushSupport() !== "granted") return;
    void currentSubscription().then((sub) => {
      if (sub) void savePushSubscriptionAction(sub.toJSON());
    });
  }, [pushKey]);

  // Ids already announced on this page: a notification is shown on the desktop at most once,
  // and never when it is more than a few minutes old. `unseen` arrived while the tab was hidden
  // and could not be shown; they count as seen once the member looks at the tab.
  const announced = useRef(new Set<string>());
  const unseen = useRef(new Set<string>());
  const onNotification = useCallback((n: ClientNotification & { unread?: number }) => {
    setItems((prev) => (prev ? [n, ...prev.filter((x) => x.id !== n.id)] : prev));
    if (typeof n.unread === "number") setUnread(n.unread);
    if (document.visibilityState === "visible") {
      reportSeen([n.id]);
      return;
    }
    const fresh = Date.now() - new Date(n.createdAt).getTime() < 5 * 60_000;
    if (desktop.current.has(n.kind) && fresh && !announced.current.has(n.id)) {
      announced.current.add(n.id);
      void showLocal(n.title, n.body, n.link ?? "/admin", n.id).then((shown) =>
        shown ? reportSeen([n.id]) : void unseen.current.add(n.id),
      );
      return;
    }
    unseen.current.add(n.id);
  }, []);

  // The live feed, while the tab is open (hidden too: being here is what holds email back),
  // polling the count when no transport gets through.
  const transport = useSyncExternalStore(onTransport, currentTransport, () => "off" as const);
  useEffect(() => {
    const refresh = () =>
      void liveState().then((s) => {
        if (!s) return;
        setUnread(s.unread);
        if (s.messages) publishMessages(s.messages);
      });
    const off = [
      // Too big for one event (the server sends `{ refresh: true }` then): ask for the count.
      subscribe("notification", (d) =>
        (d as { refresh?: boolean }).refresh ? refresh() : onNotification(d as ClientNotification),
      ),
      subscribe("count", (d) => setUnread((d as { unread: number }).unread)),
      // The stream sends Messages' numbers; the socket says a thread moved and the tab asks.
      subscribe("messages", (d) => {
        if (d && typeof d === "object" && "unread" in d)
          publishMessages(d as { unread: number; latest: string | null });
        else
          void liveState().then((s) => {
            if (s?.messages) publishMessages(s.messages);
          });
      }),
      onConnect(refresh),
    ];
    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      refresh();
      if (unseen.current.size) {
        reportSeen([...unseen.current]);
        unseen.current.clear();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      for (const o of off) o();
    };
  }, [onNotification]);
  useEffect(() => {
    if (transport !== "off") return;
    const poll = setInterval(() => {
      void liveState().then((s) => s && setUnread(s.unread));
    }, POLL_MS);
    return () => clearInterval(poll);
  }, [transport]);

  const load = (cursor?: string | null) =>
    startLoading(async () => {
      const page = await loadNotificationsAction(cursor ?? null);
      if (!page) return;
      setItems((prev) => (cursor && prev ? [...prev, ...page.items] : page.items));
      setNext(page.next);
      setUnread(page.unread);
    });

  const markAll = () => {
    setItems((prev) => prev?.map((n) => ({ ...n, read: true })) ?? prev);
    setUnread(0);
    void markNotificationsReadAction().then((n) => n !== null && setUnread(n));
  };

  const openItem = (n: ClientNotification) => {
    if (!n.read) {
      setItems((prev) => prev?.map((x) => (x.id === n.id ? { ...x, read: true } : x)) ?? prev);
      setUnread((u) => Math.max(0, u - 1));
      void markNotificationsReadAction([n.id]);
    }
    setOpen(false);
    if (n.link) router.push(n.link);
  };

  const label = unread ? `Notifications, ${unread} unread` : "Notifications";
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) load();
      }}
    >
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label={label}
            className="relative"
            data-live={transport}
          />
        }
      >
        <BellIcon className="size-5" />
        {unread > 0 && (
          <span
            aria-hidden
            className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-(--brand) px-1 text-[10px] leading-none font-semibold text-neutral-950 tabular-nums"
          >
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(24rem,calc(100vw-1rem))] gap-0 p-0">
        <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
          <p className="font-medium">Notifications</p>
          <Button variant="ghost" size="sm" onClick={markAll} disabled={!unread}>
            <CheckCheckIcon data-icon="inline-start" />
            Mark all read
          </Button>
        </div>
        <div className="max-h-[min(28rem,70vh)] overflow-y-auto" aria-busy={loading}>
          {items === null ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">Loading…</p>
          ) : items.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              Nothing yet. New bookings, guests and payments show up here.
            </p>
          ) : (
            <ul role="list" aria-label="Notifications">
              {items.map((n) => {
                const Icon = ICONS[n.kind] ?? BellIcon;
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => openItem(n)}
                      className={cn(
                        "flex w-full gap-3 border-b px-3 py-2.5 text-left last:border-b-0 hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none",
                        !n.read && "bg-(--brand)/5",
                      )}
                    >
                      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className={cn("block truncate", !n.read && "font-medium")}>
                          {n.title}
                        </span>
                        {n.body && (
                          <span className="line-clamp-2 text-xs text-muted-foreground">
                            {n.body}
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground">
                          <time dateTime={n.createdAt}>{ago(n.createdAt)}</time>
                        </span>
                      </span>
                      {!n.read && (
                        <span className="mt-1.5 size-2 shrink-0 rounded-full bg-(--brand)">
                          <span className="sr-only">Unread</span>
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {next && (
            <div className="border-t p-2">
              <Button
                variant="ghost"
                size="sm"
                className="w-full"
                disabled={loading}
                onClick={() => load(next)}
              >
                Show earlier
              </Button>
            </div>
          )}
        </div>
        <div className="border-t px-3 py-2">
          <Link
            href="/admin/notifications"
            onClick={() => setOpen(false)}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <SettingsIcon className="size-3.5" aria-hidden />
            Notification settings
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
