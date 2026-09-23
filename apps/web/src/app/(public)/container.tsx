import { PageSkeleton } from "@/components/page-skeleton";

/**
 * One container for every guest-facing page, its loading state, and the shell's header and
 * footer, so their left edges line up. Pages that read better narrow limit their own content
 * inside it (left-aligned, not centred) instead of using a different container.
 */
export function PublicContainer({
  children,
  className = "py-12",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={`mx-auto w-full max-w-4xl px-4 ${className}`}>{children}</div>;
}

/** The page-level fallback: the skeleton inside the same container as the page it replaces. */
export function PublicSkeleton() {
  return (
    <PublicContainer>
      <PageSkeleton />
    </PublicContainer>
  );
}
