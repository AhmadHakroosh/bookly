import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { hasFlag } from "@/server/flags";
import { publicOpportunity } from "@/server/hiring/apply";
import { getCurrentWorkspace } from "@/server/workspace";
import { PublicSkeleton } from "../../container";
import { ApplyView } from "./view";

export async function generateMetadata({ params }: PageProps<"/apply/[slug]">): Promise<Metadata> {
  const [{ slug }, ws] = await Promise.all([params, getCurrentWorkspace()]);
  const p = ws && (await hasFlag(ws, "hiring")) ? await publicOpportunity(ws, slug) : null;
  return p
    ? { title: p.opportunity.title, description: p.opportunity.summary ?? undefined }
    : { title: "Not found" };
}

/** An opportunity's application page (P1–P5), on the workspace's own address. */
async function ApplyPage({ params, searchParams }: PageProps<"/apply/[slug]">) {
  const [{ slug }, sp, ws] = await Promise.all([params, searchParams, getCurrentWorkspace()]);
  if (!ws || !(await hasFlag(ws, "hiring"))) notFound();
  const p = await publicOpportunity(ws, slug, {
    preview: typeof sp.preview === "string" ? sp.preview : undefined,
  });
  if (!p) notFound();
  return <ApplyView ws={ws} p={p} />;
}

export default function ApplyPageBoundary(props: PageProps<"/apply/[slug]">) {
  return (
    <Suspense fallback={<PublicSkeleton width="max-w-[720px]" />}>
      <ApplyPage {...props} />
    </Suspense>
  );
}
