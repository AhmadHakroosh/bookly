import { Suspense } from "react";
import { timezoneList } from "@/lib/time";
import { getProfileByUser } from "@/server/scheduling";
import { requireStaff } from "@/server/session";
import { getCurrentWorkspace } from "@/server/workspace";
import { ownerOf } from "@/server/data-rights";
import { DeleteAccount } from "./delete-account";
import { PasswordForm } from "./password-form";
import { ProfileForm } from "./profile-form";
import { PageSkeleton } from "@/components/page-skeleton";

export const metadata = { title: "Booking page" };

async function ProfilePage({ searchParams }: PageProps<"/admin/profile">) {
  const [{ session }, ws, sp] = await Promise.all([
    requireStaff(),
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
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Your booking page</h1>
        <p className="text-sm text-muted-foreground">
          {sp.setup === "1"
            ? "Set up your public page first, then create event types."
            : "Public profile shown at /<username>."}
        </p>
      </div>
      <ProfileForm
        initial={{
          username: p?.username ?? suggested,
          displayName: p?.displayName ?? session.user.name,
          bio: p?.bio ?? "",
          timezone: p?.timezone ?? ws.timezone,
          avatarUrl: p?.avatarUrl ?? "",
        }}
        zones={timezoneList()}
      />
      <PasswordForm />
      <DeleteAccount
        email={session.user.email}
        ownsWorkspaces={(await ownerOf(session.user.id)).map((w) => w.name)}
      />
    </div>
  );
}

export default function ProfilePageBoundary(props: PageProps<"/admin/profile">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ProfilePage {...props} />
    </Suspense>
  );
}
