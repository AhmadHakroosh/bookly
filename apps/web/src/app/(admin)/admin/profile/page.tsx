import { ProfileSkeleton } from "@/components/skeletons/pages";
import { hasFlag } from "@/server/flags";
import { Suspense } from "react";
import { timezoneList } from "@/lib/time";
import { getProfileByUser } from "@/server/scheduling";
import { requireWorkspaceUser } from "@/server/session";
import { getCurrentWorkspace } from "@/server/workspace";
import { ProfileForm } from "./profile-form";
import { PageHeader } from "@/components/ui/page-header";

export const metadata = { title: "Booking page" };

async function ProfilePage({ searchParams }: PageProps<"/admin/profile">) {
  const [{ session }, ws, sp] = await Promise.all([
    requireWorkspaceUser(),
    getCurrentWorkspace(),
    searchParams,
  ]);
  if (!ws) return null;
  const p = await getProfileByUser(ws.id, session.user.id);
  const suggested = session.user.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return (
    <div className="max-w-xl space-y-6">
      <PageHeader
        title="Your booking page"
        description={
          <>
            {sp.setup === "1"
              ? "Set up your public page first, then create event types."
              : "Public profile shown at /<username>."}
          </>
        }
      />
      <ProfileForm
        initial={{
          username: p?.username ?? suggested,
          displayName: p?.displayName ?? session.user.name,
          bio: p?.bio ?? "",
          timezone: p?.timezone ?? ws.timezone,
          avatarUrl: p?.avatarUrl ?? session.user.image ?? "",
        }}
        saved={!!p}
        zones={timezoneList()}
        uploads={await hasFlag(ws, "file_uploads")}
      />
    </div>
  );
}

export default function ProfilePageBoundary(props: PageProps<"/admin/profile">) {
  return (
    <Suspense fallback={<ProfileSkeleton />}>
      <ProfilePage {...props} />
    </Suspense>
  );
}
