import type { ReactNode } from "react";
import { cn } from "cn";
import { TextLink } from "./text-link";

/**
 * The one card of the admin (visual-alignment C5): a bordered white panel, 16 px padding on a
 * phone and 20 px from `sm`, a title row (card title, then "View all ›" or an action on the
 * right) 12 px above the content. The title is the section's name for screen readers.
 */
function SectionCard({
  id,
  title,
  more,
  action,
  className,
  children,
}: {
  id: string;
  title?: ReactNode;
  /** "View all ›" in the title row. */
  more?: { href: string; label?: string };
  /** A button or menu in the title row, instead of or beside "View all". */
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      data-slot="section-card"
      aria-labelledby={title ? `${id}-title` : undefined}
      className={cn("min-w-0 rounded-xl border bg-card p-4 sm:p-5", className)}
    >
      {(title || more || action) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          {title && (
            <h2 id={`${id}-title`} className="text-lg font-semibold tracking-tight">
              {title}
            </h2>
          )}
          <div className="flex items-center gap-2">
            {action}
            {more && (
              <TextLink href={more.href} variant="more">
                {more.label ?? "View all"}
              </TextLink>
            )}
          </div>
        </div>
      )}
      {children}
    </section>
  );
}

export { SectionCard };
