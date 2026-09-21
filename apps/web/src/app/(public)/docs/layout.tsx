import { Suspense } from "react";
import { DocsNav } from "@/components/docs-nav";
import { listDocs } from "@/server/docs";

async function Sidebar() {
  const pages = await listDocs();
  return <DocsNav pages={pages.map((p) => ({ slug: p.slug, title: p.title }))} />;
}

export default function DocsLayout({ children }: LayoutProps<"/docs">) {
  return (
    <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-10 md:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="md:sticky md:top-6 md:self-start">
        <Suspense fallback={null}>
          <Sidebar />
        </Suspense>
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
