import { SparklesIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";

/** Marks text the assistant wrote (briefings, recaps, drafts) so nobody mistakes it for a person's. */
export function AiLabel({ className = "" }: { className?: string }) {
  return (
    <Badge variant="outline" className={`gap-1 font-normal text-muted-foreground ${className}`}>
      <SparklesIcon className="size-3" aria-hidden />
      AI-generated
    </Badge>
  );
}
