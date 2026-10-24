import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "cn";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initialsOf } from "@/components/ui/avatar-stack";

/**
 * A person in a list ("Recent conversations", the Messages list, "Keep things moving"): their
 * picture, name, a subject line, a one-line preview, the time on the right and an orange dot
 * when it is unread. The whole row opens the thing it is about.
 */
function ListRow({
  name,
  image,
  subtitle,
  preview,
  meta,
  unread = false,
  href,
  selected = false,
  actions,
  className,
}: {
  name: string;
  image?: string | null;
  subtitle?: ReactNode;
  preview?: ReactNode;
  /** The time, or a status, on the right. */
  meta?: ReactNode;
  unread?: boolean;
  href?: string;
  /** Its pane is open. */
  selected?: boolean;
  /** Buttons after the text ("Draft follow-up", ⋯); not inside the link. */
  actions?: ReactNode;
  className?: string;
}) {
  const body = (
    <>
      <Avatar size="lg" aria-hidden>
        {image && <AvatarImage src={image} alt="" />}
        <AvatarFallback className="bg-accent text-sm font-semibold text-accent-foreground">
          {initialsOf(name)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <p className={cn("truncate text-sm", unread ? "font-semibold" : "font-medium")}>{name}</p>
          {meta && <span className="shrink-0 text-xs text-muted-foreground">{meta}</span>}
        </div>
        {subtitle && <p className="truncate text-sm">{subtitle}</p>}
        {preview && <p className="truncate text-xs text-muted-foreground">{preview}</p>}
      </div>
      {unread && (
        <span className="mt-1.5 size-2 shrink-0 rounded-full bg-brand">
          <span className="sr-only">Unread</span>
        </span>
      )}
    </>
  );
  const cls = cn(
    "flex min-w-0 flex-1 items-start gap-3 rounded-lg px-2 py-2.5 outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
    selected && "bg-accent",
  );
  return (
    <div data-slot="list-row" className={cn("flex min-w-0 items-center gap-2", className)}>
      {href ? (
        <Link href={href} className={cn(cls, !selected && "hover:bg-muted/60")}>
          {body}
        </Link>
      ) : (
        <div className={cls}>{body}</div>
      )}
      {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
    </div>
  );
}

export { ListRow };
