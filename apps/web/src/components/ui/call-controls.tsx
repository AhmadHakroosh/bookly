import type { ComponentType, ReactNode, SVGProps } from "react";
import { cn } from "cn";

/**
 * A participant's video (`mocks.png` 04): the stream fills a dark, rounded tile (video is dark
 * whatever the page is) and the name sits bottom-left.
 */
function VideoTile({
  name,
  className,
  children,
}: {
  name: ReactNode;
  className?: string;
  /** The `<video>`, or an avatar while the camera is off. */
  children?: ReactNode;
}) {
  return (
    <figure
      data-slot="video-tile"
      className={cn("relative aspect-video overflow-hidden rounded-xl bg-neutral-900", className)}
    >
      {children}
      <figcaption className="absolute bottom-2 left-2 flex max-w-[calc(100%-1rem)] items-center gap-1.5 rounded-md bg-black/60 px-2 py-0.5 text-xs font-medium text-white">
        {name}
      </figcaption>
    </figure>
  );
}

/** The call's control bar: icon buttons labelled underneath, End on its own in red. */
function CallControls({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      role="toolbar"
      aria-label="Call controls"
      data-slot="call-controls"
      className={cn("flex items-end gap-1 sm:gap-2", className)}
      {...props}
    />
  );
}

/**
 * One control. Spreads the rest onto the button, so a menu or popover can use it as its trigger
 * (`render={<CallControl … />}`).
 */
function CallControl({
  icon: Icon,
  label,
  pressed,
  tone = "default",
  badge = 0,
  className,
  ...props
}: Omit<React.ComponentProps<"button">, "children"> & {
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
  /** The word under the icon, also its name: "Mute", "Stop video", "Share", "More". */
  label: string;
  /** For toggles (muted, camera off, sharing). */
  pressed?: boolean;
  /** `end` is the red End button; `alert` marks a control that is off (muted, camera off). */
  tone?: "default" | "end" | "alert";
  /** A count on the icon: unread messages, people waiting. */
  badge?: number;
}) {
  if (tone === "end")
    return (
      <button
        type="button"
        aria-label={label}
        className={cn(
          "ms-auto mb-5 inline-flex h-10 shrink-0 items-center gap-2 rounded-full bg-destructive px-3 text-sm font-semibold text-white outline-none hover:bg-[color-mix(in_oklch,var(--destructive),black_12%)] focus-visible:ring-3 focus-visible:ring-destructive/40 sm:px-5",
          className,
        )}
        {...props}
      >
        {Icon && <Icon className="size-4" aria-hidden />}
        {/* On a phone the icon alone, so the button never scrolls out of reach. */}
        <span className={cn(Icon && "hidden sm:inline")}>{label}</span>
      </button>
    );
  return (
    <button
      type="button"
      aria-pressed={pressed}
      className={cn(
        "group flex w-14 shrink-0 flex-col items-center gap-1 rounded-lg py-1 text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 sm:w-16",
        className,
      )}
      {...props}
    >
      <span
        className={cn(
          "relative flex size-10 items-center justify-center rounded-full border bg-card text-foreground group-hover:bg-muted",
          pressed && "border-ink bg-ink text-ink-foreground group-hover:bg-ink-hover",
          tone === "alert" &&
            "border-destructive/30 bg-destructive/10 text-destructive group-hover:bg-destructive/15",
        )}
      >
        {Icon && <Icon className="size-5" aria-hidden />}
        {badge > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
            {badge > 9 ? "9+" : badge}
          </span>
        )}
      </span>
      <span className="max-w-full truncate">{label}</span>
    </button>
  );
}

export { VideoTile, CallControls, CallControl };
