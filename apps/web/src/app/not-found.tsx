import Link from "next/link";
import { LogoMark } from "@/components/brand/logo";

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-24 text-center">
      <title>Page not found — Bookly</title>
      <LogoMark className="size-8 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">404</p>
      <h1 className="text-2xl font-semibold tracking-tight">That page is not here</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        It may have moved, or the link was wrong.
      </p>
      <Link href="/" className="mt-2 text-sm underline underline-offset-4">
        Go to the home page
      </Link>
    </main>
  );
}
