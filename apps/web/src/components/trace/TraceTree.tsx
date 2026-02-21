"use client";

import type { IterationNode, ArtifactLink } from "@vibe-studio/shared";
import { Activity } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TraceNode } from "./TraceNode";

interface TraceTreeProps {
  rootNode: IterationNode | null;
  onArtifactClick?: (artifact: ArtifactLink) => void;
}

export function TraceTree({ rootNode, onArtifactClick }: TraceTreeProps) {
  if (!rootNode) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <div className="text-center">
          <Activity size={32} className="mx-auto mb-2 opacity-40" />
          <p className="text-sm">Waiting for events...</p>
          <p className="text-xs mt-1 text-muted-foreground/60">
            Start a vibe loop run to see trace events
          </p>
        </div>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="py-2">
        <TraceNode node={rootNode} depth={0} defaultExpanded={true} onArtifactClick={onArtifactClick} />
      </div>
    </ScrollArea>
  );
}
