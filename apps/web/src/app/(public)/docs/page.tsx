import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowRightIcon } from "lucide-react";
import { ExternalLink } from "@/components/links";
import { DOCS_REPO_URL, listDocs } from "@/server/docs";
import { PageSkeleton } from "@/components/page-skeleton";

export const metadata: Metadata = { title: "Documentation" };

async function DocsIndex() {
  const pages = await listDocs();
  return (
    <div>
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Bookly</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">Documentation</h1>
      <p className="mt-3 max-w-2xl text-muted-foreground">
        Everything about running and using this install, from self-hosting to the API. The same
        pages live in the repository, so you can read or improve them there too.
      </p>
      <p className="mt-2">
        <ExternalLink href={DOCS_REPO_URL}>Browse on GitHub</ExternalLink>
      </p>
      <ul className="mt-8 grid gap-3 sm:grid-cols-2">
        {pages.map((p) => (
          <li key={p.slug}>
            <Link
              href={`/docs/${p.slug}`}
              className="group flex h-full flex-col rounded-xl border p-4 transition-colors hover:border-foreground/40 hover:bg-muted/40"
            >
              <span className="flex items-center justify-between gap-2 font-medium">
                {p.title}
                <ArrowRightIcon
                  className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                  aria-hidden
                />
              </span>
              {p.description && (
                <span className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                  {p.description}
                </span>
              )}
            </Link>
          </li>
        ))}
        {pages.length === 0 && (
          <li className="text-sm text-muted-foreground">No documentation files were found.</li>
        )}
      </ul>
    </div>
  );
}

export default function DocsIndexBoundary() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <DocsIndex />
    </Suspense>
  );
}
