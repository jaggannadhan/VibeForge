import type { TraceStatus } from "@vibe-studio/shared";

export interface SelectedFile {
  path: string;
  name: string;
  content: string;
  language: string;
}

export const TRACE_STATUS_VARIANT: Record<TraceStatus, string> = {
  queued: "bg-gray-200 text-gray-700",
  running: "bg-blue-100 text-blue-700",
  success: "bg-green-100 text-green-700",
  error: "bg-red-100 text-red-700",
  skipped: "bg-gray-100 text-gray-500",
};

export const TRACE_STATUS_DOT: Record<TraceStatus, string> = {
  queued: "bg-gray-400",
  running: "bg-blue-500",
  success: "bg-green-500",
  error: "bg-red-500",
  skipped: "bg-gray-300",
};
