import type { TraceStatus } from "@vibe-studio/shared";
import { cn } from "@/lib/utils";
import { TRACE_STATUS_VARIANT } from "@/lib/types";

interface StatusBadgeProps {
  status: TraceStatus;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        TRACE_STATUS_VARIANT[status],
        className
      )}
    >
      {status}
    </span>
  );
}
