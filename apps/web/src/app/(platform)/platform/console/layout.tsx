import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { ConsoleNav } from "./nav";
import { isPlatformAdmin } from "@/server/platform";
import { getSession } from "@/server/session";

async function Guard({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login?next=/console");
  if (!isPlatformAdmin(session.user.email)) notFound();
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Operator console</h1>
          <p className="text-sm text-muted-foreground">Signed in as {session.user.email}</p>
        </div>
        <ConsoleNav />
      </div>
      {children}
    </div>
  );
}

export default function ConsoleLayout({ children }: LayoutProps<"/platform/console">) {
  return (
    <Suspense fallback={null}>
      <Guard>{children}</Guard>
    </Suspense>
  );
}
