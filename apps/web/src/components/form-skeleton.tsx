import { Skeleton } from "@/components/ui/skeleton";

/**
 * Placeholder for a narrow form page (sign-in, sign-up, setup): a title, a line and a few
 * fields with a button, so the skeleton has the same shape and width as the form it stands in
 * for. Wrap it in the page's own container.
 */
export function FormSkeleton({ fields = 3, tabs = false }: { fields?: number; tabs?: boolean }) {
  return (
    <div role="status" className="space-y-8" aria-busy aria-live="polite" aria-label="Loading">
      <div className="space-y-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-64 max-w-full" />
      </div>
      <div className="space-y-4">
        {tabs && <Skeleton className="h-9 w-full rounded-lg" />}
        {Array.from({ length: fields }, (_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-10 w-full rounded-lg" />
          </div>
        ))}
        <Skeleton className="h-10 w-full rounded-lg" />
      </div>
    </div>
  );
}
