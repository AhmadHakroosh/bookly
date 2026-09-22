import { isCloud } from "@/server/platform";
import { APP_VERSION, pendingUpdate } from "@/server/telemetry";

/** Self-hosted admins see when the update check found a newer release. */
export async function UpdateNotice() {
  if (isCloud()) return null;
  const update = await pendingUpdate();
  if (!update) return null;
  return (
    <p className="mb-6 rounded-md border border-(--brand)/50 bg-(--brand)/10 p-3 text-sm">
      Bookly {update.latest} is available (you run {APP_VERSION}).{" "}
      <a
        href={update.url}
        target="_blank"
        rel="noreferrer"
        className="underline underline-offset-4"
      >
        Release notes
      </a>
    </p>
  );
}
