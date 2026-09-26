import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeftIcon, ArrowRightIcon } from "lucide-react";
import { ExternalLink } from "@/components/links";
import { DOCS_REPO_URL, renderDoc } from "@/server/docs";
import { PageSkeleton } from "@/components/page-skeleton";
import { pageMetadata } from "@/app/(platform)/platform/site";

export async function generateMetadata({ params }: PageProps<"/docs/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const doc = await renderDoc(slug);
  if (!doc) return {};
  return pageMetadata({
    title: `${doc.title} · Docs`,
    description: doc.description || `${doc.title}: how it works in Bookly and how to set it up.`,
    path: `/docs/${slug}`,
  });
}

async function DocPage({ params }: PageProps<"/docs/[slug]">) {
  const { slug } = await params;
  const doc = await renderDoc(slug);
  if (!doc) notFound();
  const toc = doc.headings.filter((h) => h.level === 2);
  return (
    <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_200px]">
      <div className="min-w-0">
        <nav aria-label="Breadcrumb" className="text-xs text-muted-foreground">
          <Link href="/docs" className="hover:text-foreground">
            Documentation
          </Link>
          <span className="mx-1.5">/</span>
          <span className="text-foreground">{doc.title}</span>
        </nav>
        {/* Repository markdown, written by maintainers: rendered as-is. */}
        <article
          className="docs-prose prose mt-4 max-w-none prose-neutral dark:prose-invert prose-headings:scroll-mt-24 prose-headings:tracking-tight prose-h1:text-3xl prose-h2:mt-10 prose-h2:border-b prose-h2:pb-2 prose-h2:text-xl prose-h3:text-base prose-a:underline-offset-4 prose-code:rounded prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:text-[0.85em] prose-code:font-normal prose-code:before:content-none prose-code:after:content-none prose-pre:rounded-xl prose-pre:border prose-pre:bg-muted prose-pre:text-xs prose-pre:text-foreground prose-table:text-sm prose-th:text-left prose-img:rounded-xl"
          dangerouslySetInnerHTML={{ __html: doc.html }}
        />
        <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t pt-6 text-sm">
          <p className="text-muted-foreground">
            Found a mistake?{" "}
            <ExternalLink
              href={`${DOCS_REPO_URL}/${slug}.md`}
              className="inline-flex items-center gap-1 underline underline-offset-4"
            >
              Edit this page on GitHub
            </ExternalLink>
          </p>
        </div>
        <nav aria-label="Pages" className="mt-4 grid gap-3 sm:grid-cols-2">
          {doc.prev ? (
            <Link
              href={`/docs/${doc.prev.slug}`}
              className="flex items-center gap-2 rounded-xl border p-4 hover:bg-muted/40"
            >
              <ArrowLeftIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span>
                <span className="block text-xs text-muted-foreground">Previous</span>
                <span className="font-medium">{doc.prev.title}</span>
              </span>
            </Link>
          ) : (
            <span />
          )}
          {doc.next && (
            <Link
              href={`/docs/${doc.next.slug}`}
              className="flex items-center justify-end gap-2 rounded-xl border p-4 text-right hover:bg-muted/40"
            >
              <span>
                <span className="block text-xs text-muted-foreground">Next</span>
                <span className="font-medium">{doc.next.title}</span>
              </span>
              <ArrowRightIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            </Link>
          )}
        </nav>
      </div>
      {toc.length > 1 && (
        <aside className="hidden xl:block">
          <nav aria-label="On this page" className="sticky top-6 text-sm">
            <p className="mb-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              On this page
            </p>
            <ul className="space-y-1 border-l">
              {toc.map((h) => (
                <li key={h.id}>
                  <a
                    href={`#${h.id}`}
                    className="-ml-px block border-l-2 border-transparent py-0.5 pl-3 text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground"
                  >
                    {h.text}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </aside>
      )}
    </div>
  );
}

export default function DocPageBoundary(props: PageProps<"/docs/[slug]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <DocPage {...props} />
    </Suspense>
  );
}
