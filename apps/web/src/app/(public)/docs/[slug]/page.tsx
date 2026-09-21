import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { renderDoc } from "@/server/docs";

export async function generateMetadata({ params }: PageProps<"/docs/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const doc = await renderDoc(slug);
  return doc ? { title: doc.title } : {};
}

async function DocPage({ params }: PageProps<"/docs/[slug]">) {
  const { slug } = await params;
  const doc = await renderDoc(slug);
  if (!doc) notFound();
  // Repository markdown, written by maintainers: rendered as-is.
  return (
    <article
      className="prose max-w-none prose-neutral dark:prose-invert prose-headings:tracking-tight prose-pre:text-xs"
      dangerouslySetInnerHTML={{ __html: doc.html }}
    />
  );
}

export default function DocPageBoundary(props: PageProps<"/docs/[slug]">) {
  return (
    <Suspense fallback={null}>
      <DocPage {...props} />
    </Suspense>
  );
}
