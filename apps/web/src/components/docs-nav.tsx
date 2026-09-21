"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpenIcon } from "lucide-react";

export function DocsNav({ pages }: { pages: { slug: string; title: string }[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Documentation" className="text-sm">
      <Link
        href="/docs"
        className={`mb-3 flex items-center gap-2 px-2 text-[11px] font-medium tracking-wide uppercase ${pathname === "/docs" ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}
      >
        <BookOpenIcon className="size-3.5" aria-hidden />
        Documentation
      </Link>
      <ul className="space-y-0.5 border-l">
        {pages.map((p) => {
          const on = pathname === `/docs/${p.slug}`;
          return (
            <li key={p.slug}>
              <Link
                href={`/docs/${p.slug}`}
                aria-current={on ? "page" : undefined}
                className={`-ml-px block border-l-2 py-1 pl-3 ${on ? "border-foreground font-medium text-foreground" : "border-transparent text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground"}`}
              >
                {p.title}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
