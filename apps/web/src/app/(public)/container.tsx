import { CardList, Heading, Shell } from "@/components/skeletons/primitives";

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

/**
 * The page-level fallback: the skeleton inside the same container as the page it replaces.
 * `width`: the page's own content width, so the placeholder sits where the content will.
 */
export function PublicSkeleton({ width = "" }: { width?: string }) {
  return (
    <PublicContainer className="py-12">
      <Shell className={`mx-auto space-y-8 ${width}`}>
        <Heading width="w-56" />
        <CardList rows={3} height="h-20" />
      </Shell>
    </PublicContainer>
  );
}
