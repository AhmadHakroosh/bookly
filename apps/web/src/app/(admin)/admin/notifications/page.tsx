import { NotificationsSkeleton } from "@/components/skeletons/pages";
import { Suspense } from "react";
import { channelAvailable } from "@/server/notify";
import { getProfileByUser } from "@/server/scheduling";
import { requireStaff } from "@/server/session";
import { getCurrentWorkspace } from "@/server/workspace";
import { isCloud } from "@/server/platform";
import { PrefsForm } from "./prefs-form";
import { VerifyPanel } from "./verify-panel";

export const metadata = { title: "Notifications" };

async function NotificationsPage() {
  const [{ session }, ws] = await Promise.all([requireStaff(), getCurrentWorkspace()]);
  if (!ws) return null;
  const profile = await getProfileByUser(ws.id, session.user.id);
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
