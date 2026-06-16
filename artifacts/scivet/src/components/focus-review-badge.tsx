import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Brain } from "lucide-react";

/**
 * Marks a review whose verdict followed a qualifying FocusGuard deep session.
 * A small, honest trust signal: this reader engaged sustained attention before
 * judging — not a drive-by skim.
 */
export function FocusReviewBadge({ minutes }: { minutes: number | null }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="outline"
          className="gap-1 border-primary/30 bg-primary/5 text-primary text-[10px] font-medium"
        >
          <Brain className="h-3 w-3" />
          Deep review{minutes ? ` · ${minutes}m` : ""}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        Backed by {minutes ? `${minutes} minutes of` : "a"} focused, distraction-tracked reading
        before this verdict was cast.
      </TooltipContent>
    </Tooltip>
  );
}
