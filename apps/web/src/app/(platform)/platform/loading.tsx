import { PageSkeleton } from "@/components/page-skeleton";

/** Shown while the route segment below streams in. */
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <PageSkeleton />
    </div>
  );
}
