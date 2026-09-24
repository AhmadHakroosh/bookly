import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { dailyConfigured } from "@/server/integrations";
import { channelAvailable } from "@/server/notify";
import { getProfileByUser } from "@/server/scheduling";
import { requireStaff } from "@/server/session";
import { getCurrentWorkspace } from "@/server/workspace";
import { JoinToggle } from "./join-toggle";
import { PrefsForm } from "./prefs-form";
import { PageSkeleton } from "@/components/page-skeleton";

export const metadata = { title: "Notifications" };

async function NotificationsPage() {
  const [{ session, role }, ws] = await Promise.all([requireStaff(), getCurrentWorkspace()]);
  if (!ws) return null;
  const profile = await getProfileByUser(ws.id, session.user.id);
  const joinEnabled = ws.settings.daily?.joinPings !== false;
  const canManage = role === "owner" || role === "admin";
  return (
    <div className="max-w-2xl space-y-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
        <p className="text-sm text-muted-foreground">
          Attendees always get email confirmations and reminders. This page is about how{" "}
          <em>you</em> hear about bookings.
        </p>
      </div>
      {profile ? (
        <PrefsForm
          phone={profile.phone ?? ""}
          prefs={profile.notifications}
          channels={{ sms: channelAvailable("sms"), whatsapp: channelAvailable("whatsapp") }}
        />
      ) : (
        <p className="text-sm">Set up your booking page first.</p>
      )}
      <section className="space-y-3 rounded-xl border p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight">
              Attendee joined
              <Badge variant={joinEnabled ? "default" : "secondary"}>
                {joinEnabled ? "On" : "Off"}
              </Badge>
            </h2>
            <p className="text-sm text-muted-foreground">
              When the first attendee enters a Bookly video room, Bookly pings you on the channels
              above. Needs Bookly video to be set up.
            </p>
          </div>
          {canManage && dailyConfigured() && <JoinToggle enabled={joinEnabled} />}
        </div>
        {!dailyConfigured() && (
          <p className="text-xs text-muted-foreground">
            Bookly video is not configured on this server.
          </p>
        )}
      </section>
    </div>
  );
}

export default function NotificationsPageBoundary() {
  return (
    <Suspense
      fallback={
        <div className="max-w-2xl">
          <PageSkeleton />
        </div>
      }
    >
      <NotificationsPage />
    </Suspense>
  );
}
