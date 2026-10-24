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
  name: string;
  className?: string;
  /** The `<video>`, or an avatar while the camera is off. */
  children?: ReactNode;
}) {
  return (
    <figure
      data-slot="video-tile"
      className={cn("relative aspect-video overflow-hidden rounded-xl bg-black", className)}
    >
      {children}
      <figcaption className="absolute bottom-2 left-2 rounded-md bg-black/60 px-2 py-0.5 text-xs font-medium text-white">
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
      className={cn("flex items-end gap-2", className)}
      {...props}
    />
  );
}

function CallControl({
  icon: Icon,
  label,
  pressed,
  tone = "default",
  onClick,
}: {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  /** The word under the icon, also its name: "Mute", "Stop video", "Share", "More". */
  label: string;
  /** For toggles (muted, camera off, sharing). */
  pressed?: boolean;
  /** `end` is the red End button. */
  tone?: "default" | "end";
  onClick?: () => void;
}) {
  if (tone === "end")
    return (
      <button
        type="button"
        onClick={onClick}
        className="ms-auto h-10 rounded-lg bg-destructive px-5 text-sm font-semibold text-white outline-none hover:bg-[color-mix(in_oklch,var(--destructive),black_12%)] focus-visible:ring-3 focus-visible:ring-destructive/40"
      >
        {label}
      </button>
    );
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      className="group flex w-16 flex-col items-center gap-1 rounded-lg py-1 text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <span
        className={cn(
          "flex size-10 items-center justify-center rounded-full border bg-card text-foreground group-hover:bg-muted",
          pressed && "border-ink bg-ink text-ink-foreground group-hover:bg-ink-hover",
        )}
      >
        <Icon className="size-5" aria-hidden />
      </span>
      {label}
    </button>
  );
}

export { VideoTile, CallControls, CallControl };
