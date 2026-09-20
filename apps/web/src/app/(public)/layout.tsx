import Link from "next/link";
import { Suspense } from "react";
import { headers } from "next/headers";
import { getCurrentWorkspace } from "@/server/workspace";

export default function PublicLayout({ children }: LayoutProps<"/">) {
  return (
    <Suspense fallback={null}>
      <Shell>{children}</Shell>
    </Suspense>
  );
}

async function Shell({ children }: { children: React.ReactNode }) {
  const ws = await getCurrentWorkspace();
  const footer = ws?.settings.footerText;
  const embedded = (await headers()).get("x-bookly-embed") === "1";
  return (
    <>
      <main className="flex-1">{children}</main>
      {!embedded && (
        <footer className="mx-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-2 px-4 py-6 text-xs text-muted-foreground">
          <span>{footer || ws?.name}</span>
          <span>
            Scheduling by{" "}
            <Link
              href="https://github.com/AhmadHakroosh/bookly"
              className="underline underline-offset-2 hover:text-foreground"
            >
              Bookly
            </Link>
          </span>
        </footer>
      )}
    </>
  );
}
