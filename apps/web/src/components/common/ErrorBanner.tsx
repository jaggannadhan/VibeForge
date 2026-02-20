import { AlertTriangle, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ErrorBannerProps {
  message: string;
  onDismiss?: () => void;
  className?: string;
}

export function ErrorBanner({ message, onDismiss, className }: ErrorBannerProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700",
        className
      )}
    >
      <AlertTriangle size={16} className="shrink-0" />
      <span className="flex-1">{message}</span>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="shrink-0 rounded-sm p-0.5 hover:bg-red-100"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
