import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getRoutingForm } from "@/server/routing";
import { getCurrentWorkspace } from "@/server/workspace";
import { RoutingFormView } from "./form";
import { PageSkeleton } from "@/components/page-skeleton";

export async function generateMetadata({ params }: PageProps<"/r/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const ws = await getCurrentWorkspace();
  const form = ws ? await getRoutingForm(ws.id, slug) : null;
  return form ? { title: form.name, description: form.description ?? undefined } : {};
}

async function RoutingPage({ params, searchParams }: PageProps<"/r/[slug]">) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const ws = await getCurrentWorkspace();
  const form = ws ? await getRoutingForm(ws.id, slug) : null;
  if (!ws || !form) notFound();
  const message = typeof sp.message === "string" ? sp.message : null;
  return (
    <div className="mx-auto w-full max-w-lg px-4 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">{form.name}</h1>
      {form.description && (
        <p className="mt-2 text-sm whitespace-pre-line text-muted-foreground">{form.description}</p>
      )}
      {message ? (
        <p className="mt-6 rounded-xl border p-5 text-sm whitespace-pre-line">{message}</p>
      ) : (
        <div className="mt-6">
          <RoutingFormView slug={form.slug} questions={form.questions} />
        </div>
      )}
    </div>
  );
}

export default function RoutingPageBoundary(props: PageProps<"/r/[slug]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <RoutingPage {...props} />
    </Suspense>
  );
}
