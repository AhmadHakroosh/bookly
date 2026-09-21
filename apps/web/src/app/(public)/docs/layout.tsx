import Link from "next/link";
import { Suspense } from "react";
import { listDocs } from "@/server/docs";

async function DocsNav() {
  const pages = await listDocs();
  return (
    <nav aria-label="Documentation" className="text-sm">
      <p className="mb-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        Documentation
      </p>
      <ul className="space-y-0.5">
        {pages.map((p) => (
          <li key={p.slug}>
            <Link href={`/docs/${p.slug}`} className="block rounded-md px-2 py-1 hover:bg-muted">
              {p.title}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export default function DocsLayout({ children }: LayoutProps<"/docs">) {
  return (
    <div className="mx-auto grid w-full max-w-5xl gap-8 px-4 py-12 md:grid-cols-[200px_1fr]">
      <aside>
        <Suspense fallback={null}>
          <DocsNav />
        </Suspense>
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
