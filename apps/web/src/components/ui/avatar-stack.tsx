import { cn } from "cn";
import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarImage,
} from "@/components/ui/avatar";

export type StackPerson = { name: string; image?: string | null };

/** "Maya Chen" → "MC", "jordan@x.io" → "J"; one or two letters, whatever the name's shape. */
export function initialsOf(name: string) {
  const words = name
    .replace(/@.*/, "")
    .trim()
    .split(/[\s._-]+/)
    .filter(Boolean);
  const letters = words.length > 1 ? [words[0]![0], words.at(-1)![0]] : [words[0]?.[0]];
  return letters.join("").toUpperCase() || "?";
}

/**
 * Overlapping avatars for the people on a meeting, a review panel or a card ("3 interviewers"),
 * then "+N" past `max`. Screen readers hear the names once, not each picture.
 */
function AvatarStack({
  people,
  max = 3,
  size = "sm",
  className,
}: {
  people: StackPerson[];
  max?: number;
  size?: "sm" | "default" | "lg";
  className?: string;
}) {
  const shown = people.slice(0, max);
  const more = people.length - shown.length;
  return (
    <span data-slot="avatar-stack" className={cn("inline-flex", className)}>
      <AvatarGroup aria-hidden className="*:data-[slot=avatar]:ring-card">
        {shown.map((p, i) => (
          <Avatar key={`${p.name}-${i}`} size={size}>
            {p.image && <AvatarImage src={p.image} alt="" />}
            <AvatarFallback className="bg-accent font-medium text-accent-foreground">
              {initialsOf(p.name)}
            </AvatarFallback>
          </Avatar>
        ))}
        {more > 0 && (
          <AvatarGroupCount className="text-xs font-medium ring-card">+{more}</AvatarGroupCount>
        )}
      </AvatarGroup>
      <span className="sr-only">{people.map((p) => p.name).join(", ")}</span>
    </span>
  );
}

export { AvatarStack };
