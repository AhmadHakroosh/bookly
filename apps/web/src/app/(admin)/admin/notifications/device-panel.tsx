"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { MonitorSmartphoneIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  currentSubscription,
  requestPermission,
  showLocal,
  subscribe,
  usePushSupport,
} from "@/lib/push-client";
import {
  removePushSubscriptionAction,
  savePushSubscriptionAction,
  sendTestPushAction,
} from "./feed-actions";

export type Device = { id: string; device: string | null; lastSentAt: string | null };

/**
 * Desktop notifications on this browser: ask for permission, subscribe to Web Push (when the
 * install has VAPID keys) and list the member's other browsers so a lost laptop can be removed.
 */
export function DevicePanel({ pushKey, devices }: { pushKey: string | null; devices: Device[] }) {
  const router = useRouter();
  const support = usePushSupport();
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (support === "granted" && pushKey)
      void currentSubscription().then((sub) => setEndpoint(sub?.endpoint ?? null));
  }, [support, pushKey]);

  const on = support === "granted" && (!pushKey || !!endpoint);
  const turnOn = () =>
    start(async () => {
      if (!pushKey) {
        const p = await requestPermission();
        if (p !== "granted") toast.error("Your browser blocked notifications for Bookly.");
        return;
      }
      const sub = await subscribe(pushKey);
      if (!sub) {
        toast.error("Your browser did not allow notifications for Bookly.");
        return;
      }
      await savePushSubscriptionAction(sub.toJSON());
      setEndpoint(sub.endpoint);
      router.refresh();
    });
  const turnOff = () =>
    start(async () => {
      const sub = await currentSubscription();
      if (sub) {
        await removePushSubscriptionAction({ endpoint: sub.endpoint });
        await sub.unsubscribe().catch(() => {});
      }
      setEndpoint(null);
      router.refresh();
    });
  const test = () =>
    start(async () => {
      const { sent } = await sendTestPushAction();
      if (sent) return void toast.success("Sent. It should appear in a moment.");
      await showLocal(
        "Notifications are on",
        "This is how Bookly will tell you about bookings, guests and payments.",
        "/admin/notifications",
        "test",
      );
    });
  const remove = (id: string) =>
    start(async () => {
      await removePushSubscriptionAction({ id });
      router.refresh();
    });

  return (
    <section className="space-y-4" aria-labelledby="device-heading">
      <div>
        <h2 id="device-heading" className="text-base font-semibold tracking-tight">
          Desktop notifications
        </h2>
        <p className="text-sm text-muted-foreground">
          {pushKey
            ? "Bookly can notify this browser even when every Bookly tab is closed. Install it from your browser's menu to get an app with its own icon."
            : "Bookly can notify this browser while a Bookly tab is open (this server has no Web Push keys, so closed tabs stay quiet)."}
        </p>
      </div>
      {support === "unsupported" ? (
        <p className="text-sm text-muted-foreground">
          This browser does not support notifications. On iPhone and iPad, add Bookly to your Home
          Screen first (Share → Add to Home Screen), then open it from there.
        </p>
      ) : support === "denied" ? (
        <p className="text-sm text-muted-foreground">
          Notifications are blocked for this site. Allow them in your browser&apos;s site settings
          (the icon next to the address), then reload this page.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {on ? (
            <>
              <Button variant="outline" onClick={test} disabled={pending}>
                Send a test
              </Button>
              {pushKey && (
                <Button variant="ghost" onClick={turnOff} disabled={pending}>
                  Turn off on this browser
                </Button>
              )}
            </>
          ) : (
            <Button onClick={turnOn} disabled={pending || support === null}>
              Turn on for this browser
            </Button>
          )}
        </div>
      )}
      {devices.length > 0 && (
        <ul className="divide-y rounded-xl border text-sm" aria-label="Browsers with notifications">
          {devices.map((d) => (
            <li key={d.id} className="flex items-center gap-3 px-3 py-2">
              <MonitorSmartphoneIcon className="size-4 text-muted-foreground" aria-hidden />
              <span className="flex-1">
                {d.device ?? "Browser"}
                {d.lastSentAt && (
                  <span className="block text-xs text-muted-foreground">
                    Last notified {new Date(d.lastSentAt).toLocaleDateString()}
                  </span>
                )}
              </span>
              <Button variant="ghost" size="sm" onClick={() => remove(d.id)} disabled={pending}>
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
