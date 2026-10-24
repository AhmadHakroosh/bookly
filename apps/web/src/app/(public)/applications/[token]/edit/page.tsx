import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { rawFrom } from "@/components/forms/raw";
import { ApplyForm } from "@/components/hiring/apply-form";
import { hasFlag } from "@/server/flags";
import { statusByToken } from "@/server/hiring/apply";
import { identityFields } from "@/server/hiring/apply-text";
import { getCurrentWorkspace } from "@/server/workspace";
import { PublicContainer, PublicSkeleton } from "../../../container";

export const metadata: Metadata = { title: "Edit your application", robots: { index: false } };

/**
 * Editing a submitted application (ADR 0003, step 15a): the same form with the current answers,
 * while the application is still new. Saving keeps the earlier answers as a previous revision.
 */
async function EditPage({ params }: PageProps<"/applications/[token]/edit">) {
  const [{ token }, ws] = await Promise.all([params, getCurrentWorkspace()]);
  if (!ws || !(await hasFlag(ws, "hiring"))) notFound();
  const r = await statusByToken(ws, token);
  if (r.kind !== "ok" || !r.view.editable || !r.view.form || !r.view.opportunity.formId)
    redirect(`/applications/${token}`);
  const v = r.view;
  const files = v.files.map((f) => ({ id: f.id, name: f.name, size: 0 }));
  return (
    <PublicContainer className="py-10">
      <div className="max-w-[720px] space-y-6">
        <header className="space-y-1">
          <p className="text-sm text-muted-foreground">Edit your application</p>
          <h1 className="text-2xl font-semibold tracking-tight">{v.opportunity.title}</h1>
        </header>
        <section className="rounded-2xl border bg-card p-5 sm:p-6">
          <ApplyForm
            mode="edit"
            title={v.opportunity.title}
            slug={v.opportunity.slug}
            statusToken={token}
            formId={v.opportunity.formId!}
            schema={v.form!}
            workspaceName={v.opportunity.settings.senderName || ws.name}
            initial={{ token: null, raw: rawFrom(v.form!, v.answers, files) }}
            askAccommodations={false}
            notice=""
            preview={false}
            emailFieldId={identityFields(v.form!).email?.id ?? null}
          />
        </section>
      </div>
    </PublicContainer>
  );
}

export default function EditPageBoundary(props: PageProps<"/applications/[token]/edit">) {
  return (
    <Suspense fallback={<PublicSkeleton width="max-w-[720px]" />}>
      <EditPage {...props} />
    </Suspense>
  );
}
