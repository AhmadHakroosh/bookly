import { redirect } from "next/navigation";

/**
 * Conferencing is a section of Calendars & conferencing (`mocks.png` 05). Old links and the
 * Zoom connect flow's way back still land here; the error code travels along.
 */
export default async function ConferencingPage({ searchParams }: PageProps<"/admin/conferencing">) {
  const sp = await searchParams;
  const q = new URLSearchParams();
  for (const k of ["error", "connected"]) if (typeof sp[k] === "string") q.set(k, sp[k]);
  redirect(`/admin/calendars${q.size ? `?${q}` : ""}#conferencing`);
}
