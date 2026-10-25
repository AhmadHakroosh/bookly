import type { Metadata } from "next";
import { permanentRedirect } from "next/navigation";
import { Suspense } from "react";
import { SOLUTIONS, SolutionsHero, SolutionsPage, solutionMetadata } from "../solutions";

/** Consultants lives at /solutions; every other tab is prerendered here (unknown slugs 404). */
export function generateStaticParams() {
  return SOLUTIONS.filter((s) => s.slug !== "consultants").map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({
  params,
}: PageProps<"/platform/solutions/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const s = SOLUTIONS.find((x) => x.slug === slug);
  return s ? solutionMetadata(s) : {};
}

async function Solution({ params }: Pick<PageProps<"/platform/solutions/[slug]">, "params">) {
  const { slug } = await params;
  if (slug === "consultants") permanentRedirect("/solutions");
  return <SolutionsPage slug={slug} />;
}

/** The slug is URL data: it resolves inside Suspense, so every tab shares the route's App Shell. */
export default function Page({ params }: PageProps<"/platform/solutions/[slug]">) {
  return (
    <Suspense fallback={<SolutionsHero />}>
      <Solution params={params} />
    </Suspense>
  );
}
