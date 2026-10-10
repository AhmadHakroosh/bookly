import { Badge } from "@/components/ui/badge";

/**
 * Marks a page or control that is live through a beta flag. Pages behind a flag render this
 * next to their title so hosts know the feature may still change (and where to opt out).
 */
export function BetaBadge({ className }: { className?: string }) {
  return (
    <Badge variant="secondary" className={className} title="This feature is in beta and may change">
      Beta
    </Badge>
  );
}
