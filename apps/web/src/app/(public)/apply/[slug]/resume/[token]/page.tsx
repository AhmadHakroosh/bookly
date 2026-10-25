import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { and, eq, isNull, schema } from "@bookly/db";
import { db } from "@/lib/db";
import { hasFlag } from "@/server/flags";
import { openDraft, publicOpportunity } from "@/server/hiring/apply";
import { COPY } from "@/server/hiring/apply-text";
import { getCurrentWorkspace } from "@/server/workspace";
import { PublicContainer, PublicSkeleton } from "../../../../container";
import { ApplyView } from "../../view";

export const metadata: Metadata = { title: "Your application", robots: { index: false } };

/** "Finish your application": the page with the draft the link opens (P2, "Welcome back"). */
async function ResumePage({ params }: PageProps<"/apply/[slug]/resume/[token]">) {
  const [{ slug, token }, ws] = await Promise.all([params, getCurrentWorkspace()]);
  if (!ws || !(await hasFlag(ws, "hiring"))) notFound();
  const p = await publicOpportunity(ws, slug);
  if (!p?.form) notFound();
  const draft = await openDraft(ws, p.form.id, token);
  if (!draft)
    return (
      <PublicContainer>
        <div className="max-w-[720px] space-y-3">
          <h1 className="text-2xl font-semibold">{COPY.expired}</h1>
          <p className="text-sm text-muted-foreground">
            Your draft is no longer available. You can start your application again.
          </p>
          <a href={`/apply/${slug}`} className="text-sm text-primary underline underline-offset-2">
            Go to the application page
          </a>
        </div>
      </PublicContainer>
    );
  const files = await db()
    .select({ id: schema.files.id, name: schema.files.name, size: schema.files.size })
    .from(schema.files)
    .where(
      and(
        eq(schema.files.ownerType, "form_response"),
        eq(schema.files.ownerId, draft.id),
        eq(schema.files.status, "ready"),
        isNull(schema.files.deletedAt),
      ),
    );
  return (
    <ApplyView
      ws={ws}
      p={p}
      draft={{ token, answers: draft.answers, startedAt: draft.startedAt, files }}
    />
  );
}

export default function ResumePageBoundary(props: PageProps<"/apply/[slug]/resume/[token]">) {
  return (
    <Suspense fallback={<PublicSkeleton width="max-w-[720px]" />}>
      <ResumePage {...props} />
    </Suspense>
  );
}
