import { notFound } from "next/navigation";
import { Suspense } from "react";
import { conferencingAvailability } from "@/server/integrations";
import { paymentsConfigured } from "@/server/payments";
import {
  getEventTypeById,
  getProfileByUser,
  listProfiles,
  listSchedules,
} from "@/server/scheduling";
import { requireStaff } from "@/server/session";
import { getCurrentWorkspace } from "@/server/workspace";
import { EventTypeForm } from "./event-type-form";

export const metadata = { title: "Edit event type" };

async function EditEventTypePage({ params }: PageProps<"/admin/event-types/[id]">) {
  const [{ id }, { session }, ws] = await Promise.all([
    params,
    requireStaff(),
    getCurrentWorkspace(),
  ]);
  if (!ws) return null;
  const et = await getEventTypeById(ws.id, id);
  if (!et) notFound();
  const [schedules, profile, avail, profiles] = await Promise.all([
    listSchedules(ws.id, et.userId),
    getProfileByUser(ws.id, session.user.id),
    conferencingAvailability(et.userId),
    listProfiles(ws.id),
  ]);
  const teammates = profiles
    .filter((p) => p.userId !== et.userId)
    .map((p) => ({ userId: p.userId, name: p.displayName }));
  return (
    <EventTypeForm
      paymentsReady={paymentsConfigured()}
      teammates={teammates}
      ready={{
        daily: avail.daily,
        google_meet: avail.google_meet,
        teams: avail.teams,
        zoom: avail.zoom,
      }}
      initial={{
        id: et.id,
        title: et.title,
        slug: et.slug,
        description: et.description ?? "",
        durationMin: et.durationMin,
        slotIntervalMin: et.slotIntervalMin ?? 0,
        bufferBeforeMin: et.bufferBeforeMin,
        bufferAfterMin: et.bufferAfterMin,
        minNoticeMin: et.minNoticeMin,
        maxDaysAhead: et.maxDaysAhead,
        maxPerDay: et.maxPerDay ?? 0,
        locationType: et.location.type,
        locationValue: et.location.value ?? "",
        color: et.color,
        scheduleId: et.scheduleId ?? "",
        requiresConfirmation: et.requiresConfirmation,
        priceCents: et.priceCents ?? 0,
        currency: et.currency ?? "usd",
        remindByText: et.remindByText,
        questionsList: et.questions,
        reminders: et.reminders.join(", "),
        followUp: et.followUp,
        assignment: et.assignment,
        hostUserIds: et.hostUserIds,
        hidden: et.hidden,
      }}
      schedules={schedules.map((s) => ({ id: s.id, name: `${s.name} (${s.timezone})` }))}
      publicUrl={profile ? `/${profile.username}/${et.slug}` : null}
    />
  );
}

export default function EditEventTypePageBoundary(props: PageProps<"/admin/event-types/[id]">) {
  return (
    <Suspense fallback={null}>
      <EditEventTypePage {...props} />
    </Suspense>
  );
}
