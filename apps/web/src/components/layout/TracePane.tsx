"use client";

import { useEffect, useState } from "react";
import type { IterationNode } from "@vibe-studio/shared";
import { Activity } from "lucide-react";
import { getMockTraceStream } from "@/lib/ws";
import { TraceTree } from "@/components/trace/TraceTree";

interface TracePaneProps {
  projectId: string;
}

export function TracePane({ projectId }: TracePaneProps) {
  const [traceTree, setTraceTree] = useState<IterationNode | null>(null);

  useEffect(() => {
    const stream = getMockTraceStream();
    const unsubscribe = stream.subscribe((tree) => {
      setTraceTree(tree);
    });

    // Start the simulation after a short delay
    const timer = setTimeout(() => {
      stream.start();
    }, 2000);

    return () => {
      unsubscribe();
      clearTimeout(timer);
    };
  }, [projectId]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <Activity size={14} className="text-muted-foreground" />
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Agent Trace
        </span>
        {traceTree?.status === "running" && (
          <span className="ml-auto flex items-center gap-1 text-xs text-blue-600">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
            Live
          </span>
        )}
      </div>
      <div className="flex-1 overflow-hidden">
        <TraceTree rootNode={traceTree} />
      </div>
    </div>
  );
}
