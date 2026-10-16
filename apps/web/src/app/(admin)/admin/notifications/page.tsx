import { NotificationsSkeleton } from "@/components/skeletons/pages";
import { Suspense } from "react";
import { channelAvailable } from "@/server/notify";
import { getProfileByUser } from "@/server/scheduling";
import { requireStaff } from "@/server/session";
import { getCurrentWorkspace } from "@/server/workspace";
import { isCloud } from "@/server/platform";
import { and, desc, eq, schema } from "@bookly/db";
import { BetaBadge } from "@/components/beta-badge";
import { db } from "@/lib/db";
import { hasFlag } from "@/server/flags";
import { KIND_KEYS, KINDS, channelsFor } from "@/server/notifications";
import { vapidPublicKey } from "@/server/push";
import { DevicePanel } from "./device-panel";
import { KindsForm } from "./kinds-form";
import { PrefsForm } from "./prefs-form";
import { VerifyPanel } from "./verify-panel";

export const metadata = { title: "Notifications" };

async function NotificationsPage() {
  const [{ session }, ws] = await Promise.all([requireStaff(), getCurrentWorkspace()]);
  if (!ws) return null;
  const [profile, flagged] = await Promise.all([
    getProfileByUser(ws.id, session.user.id),
    hasFlag(ws, "notifications"),
  ]);
  const devices = flagged
    ? await db()
        .select()
        .from(schema.pushSubscriptions)
        .where(
          and(
            eq(schema.pushSubscriptions.workspaceId, ws.id),
            eq(schema.pushSubscriptions.userId, session.user.id),
          ),
        )
        .orderBy(desc(schema.pushSubscriptions.createdAt))
    : [];
  return (
    <div className="max-w-2xl space-y-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
        <p className="text-sm text-muted-foreground">
          Attendees always get email confirmations and reminders. This page is about how{" "}
          <em>you</em> hear about bookings; teammates set their own.
        </p>
      </div>
      {profile ? (
        <>
          {flagged && (
            <>
              <section className="space-y-4" aria-labelledby="kinds-heading">
                <div>
                  <h2
                    id="kinds-heading"
                    className="flex items-center gap-2 text-base font-semibold tracking-tight"
                  >
                    What you hear about <BetaBadge />
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    The bell in the header lists everything you keep &ldquo;In Bookly&rdquo;.
                  </p>
                </div>
                <KindsForm
                  rows={KIND_KEYS.map((k) => ({
                    key: k,
                    label: KINDS[k].label,
                    hint: KINDS[k].hint,
                    ...channelsFor(profile.notifications, k),
                  }))}
                />
              </section>
              <DevicePanel
                pushKey={vapidPublicKey()}
                devices={devices.map((d) => ({
                  id: d.id,
                  device: d.device,
                  lastSentAt: d.lastSentAt?.toISOString() ?? null,
                }))}
              />
              <h2 className="text-base font-semibold tracking-tight">Texts and Slack</h2>
            </>
          )}
          <PrefsForm
            phone={profile.phone ?? ""}
            prefs={profile.notifications}
            channels={{ sms: channelAvailable("sms"), whatsapp: channelAvailable("whatsapp") }}
            selfHosted={!isCloud()}
          />
          <VerifyPanel
            phone={profile.phone ?? ""}
            verified={!!profile.phoneVerifiedAt}
            codePending={
              !!profile.phoneVerification &&
              new Date(profile.phoneVerification.expiresAt) > new Date() &&
              profile.phoneVerification.phone === profile.phone
            }
            channelOn={(profile.notifications.channel ?? "none") !== "none"}
            slackUrl={profile.notifications.slackWebhookUrl ?? ""}
          />
        </>
      ) : (
        <p className="text-sm">Set up your booking page first.</p>
      )}
    </div>
  );
}

export default function NotificationsPageBoundary() {
  return (
    <Suspense fallback={<NotificationsSkeleton />}>
      <NotificationsPage />
    </Suspense>
  );
}
