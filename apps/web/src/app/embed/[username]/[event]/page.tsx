import { redirect } from "next/navigation";

/** Bare booking page for iframes: same flow as /<username>/<event>, no site chrome. */
export default async function EmbedEvent({
  params,
  searchParams,
}: PageProps<"/embed/[username]/[event]">) {
  const [{ username, event }, sp] = await Promise.all([params, searchParams]);
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (typeof v === "string") q.set(k, v);
  q.set("embed", "1");
  redirect(`/${username}/${event}?${q.toString()}`);
}
