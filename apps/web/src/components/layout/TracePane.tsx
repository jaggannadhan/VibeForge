"use client";

import { useEffect, useRef } from "react";
import { Activity } from "lucide-react";
import type { ArtifactLink } from "@vibe-studio/shared";
import { useTraceStream } from "@/lib/ws";
import { TraceTree } from "@/components/trace/TraceTree";

interface TracePaneProps {
  projectId: string;
  runActive?: boolean;
  onRunComplete?: () => void;
  onArtifactClick?: (artifact: ArtifactLink) => void;
  onIterationClick?: (iterationIndex: number) => void;
  onBestUpdated?: (bestIterationId: number | null) => void;
}

export function TracePane({ projectId, runActive = false, onRunComplete, onArtifactClick, onIterationClick, onBestUpdated }: TracePaneProps) {
  const { tree, runStatus, bestIterationId } = useTraceStream(projectId, runActive);

  // Fire onRunComplete when runStatus transitions to "success"
  const prevStatus = useRef(runStatus);
  useEffect(() => {
    if (runStatus === "success" && prevStatus.current !== "success") {
      onRunComplete?.();
    }
    prevStatus.current = runStatus;
  }, [runStatus, onRunComplete]);

  // Notify parent when best iteration changes
  const prevBest = useRef(bestIterationId);
  useEffect(() => {
    if (bestIterationId !== prevBest.current) {
      onBestUpdated?.(bestIterationId);
      prevBest.current = bestIterationId;
    }
  }, [bestIterationId, onBestUpdated]);

  const isLive = runStatus === "running";

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <Activity size={14} className="text-muted-foreground" />
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Agent Trace
        </span>
        {isLive && (
          <span className="ml-auto flex items-center gap-1 text-xs text-blue-600">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
            Live
          </span>
        )}
        {runStatus === "success" && (
          <span className="ml-auto text-xs text-green-600">Complete</span>
        )}
        {runStatus === "error" && (
          <span className="ml-auto text-xs text-red-600">Error</span>
        )}
      </div>
      <div className="flex-1 overflow-hidden">
        <TraceTree
          rootNode={tree}
          onArtifactClick={onArtifactClick}
          onIterationClick={onIterationClick}
        />
      </div>
    </div>
  );
}
