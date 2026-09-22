import { Skeleton } from "@/components/ui/skeleton";

/** Route-level placeholder while a page's data streams in: a title, a line and two cards. */
export function PageSkeleton() {
  return (
    <div role="status" className="space-y-6" aria-busy aria-live="polite" aria-label="Loading">
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
      </div>
      <Skeleton className="h-48 rounded-xl" />
    </div>
  );
}
