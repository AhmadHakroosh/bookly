import type { ReactNode } from "react";

/** Long-form marketing/legal page shell. */
export function Prose({
  title,
  lede,
  updated,
  children,
}: {
  title: string;
  lede?: string;
  updated?: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-14 md:py-20">
      <header className="mb-10">
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">{title}</h1>
        {lede && <p className="mt-3 text-lg text-muted-foreground">{lede}</p>}
        {updated && <p className="mt-2 text-xs text-muted-foreground">Last updated {updated}</p>}
      </header>
      <div className="prose max-w-none prose-neutral dark:prose-invert prose-headings:scroll-mt-20 prose-headings:font-semibold prose-headings:tracking-tight prose-a:underline-offset-4">
        {children}
      </div>
    </div>
  );
}
