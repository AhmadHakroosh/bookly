import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { RecoverForm } from "@/components/hiring/status-actions";
import { hasFlag } from "@/server/flags";
import { COPY } from "@/server/hiring/apply-text";
import { getCurrentWorkspace } from "@/server/workspace";
import { PublicContainer, PublicSkeleton } from "../../container";

export const metadata: Metadata = { title: "Get a new link", robots: { index: false } };

/** P8: a new status link by email, the same answer whether or not an application exists. */
async function RecoverPage() {
  const ws = await getCurrentWorkspace();
  if (!ws || !(await hasFlag(ws, "hiring"))) notFound();
  return (
    <PublicContainer>
      <div className="max-w-[480px] space-y-4">
        <h1 className="text-2xl font-semibold">Get a new link to your application</h1>
        <p className="text-sm text-muted-foreground">{COPY.recoverHelp}</p>
        <RecoverForm />
      </div>
    </PublicContainer>
  );
}

export default function RecoverPageBoundary() {
  return (
    <Suspense fallback={<PublicSkeleton width="max-w-[480px]" />}>
      <RecoverPage />
    </Suspense>
  );
}
