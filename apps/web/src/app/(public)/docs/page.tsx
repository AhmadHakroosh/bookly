import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { listDocs } from "@/server/docs";

export const metadata: Metadata = { title: "Documentation" };

async function DocsIndex() {
  const pages = await listDocs();
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Bookly documentation</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Everything about running and using this install. The same pages live in the repository under{" "}
        <code>docs/</code>.
      </p>
      <ul className="mt-6 grid gap-3 sm:grid-cols-2">
        {pages.map((p) => (
          <li key={p.slug}>
            <Link href={`/docs/${p.slug}`} className="block rounded-xl border p-4 hover:bg-muted">
              <span className="font-medium">{p.title}</span>
              <span className="block text-xs text-muted-foreground">/docs/{p.slug}</span>
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
    <Suspense fallback={null}>
      <DocsIndex />
    </Suspense>
  );
}
