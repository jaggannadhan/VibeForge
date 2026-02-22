"use client";

import { useState } from "react";
import type { IterationNode, ArtifactLink } from "@vibe-studio/shared";
import { ChevronRight, ChevronDown, FileDown, Eye, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/common/Badge";
import { Spinner } from "@/components/common/Spinner";
import { TRACE_STATUS_DOT } from "@/lib/types";

interface TraceNodeProps {
  node: IterationNode;
  depth?: number;
  defaultExpanded?: boolean;
  onArtifactClick?: (artifact: ArtifactLink) => void;
  onIterationClick?: (iterationIndex: number) => void;
}

function formatDuration(start?: string, end?: string): string | null {
  if (!start) return null;
  const startMs = new Date(start).getTime();
  const endMs = end ? new Date(end).getTime() : Date.now();
  const diffMs = endMs - startMs;
  if (diffMs < 1000) return `${diffMs}ms`;
  return `${(diffMs / 1000).toFixed(1)}s`;
}

function formatScore(score?: number): string {
  if (score === undefined) return "-";
  return `${(score * 100).toFixed(0)}%`;
}

export function TraceNode({ node, depth = 0, defaultExpanded = true, onArtifactClick, onIterationClick }: TraceNodeProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const hasChildren = node.children && node.children.length > 0;
  const isRunning = node.status === "running";
  const paddingLeft = 8 + depth * 16;

  // Iteration nodes are clickable when completed (not running)
  const isIterationNode = node.stepKey === "iteration";
  const isClickable = isIterationNode && !isRunning && (node.status === "success" || node.status === "error");

  const handleRowClick = () => {
    if (isClickable && onIterationClick) {
      onIterationClick(node.iterationIndex);
    }
  };

  return (
    <div>
      <div
        className={cn(
          "flex items-start gap-2 py-1.5 pr-3 text-sm hover:bg-accent/30 transition-colors",
          isRunning && "bg-blue-50/50",
          isClickable && "cursor-pointer hover:bg-accent/50",
          isIterationNode && node.decision && !node.decision.accepted && "opacity-60"
        )}
        style={{ paddingLeft }}
        onClick={handleRowClick}
      >
        {/* Expand/collapse toggle */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            hasChildren && setExpanded(!expanded);
          }}
          className={cn(
            "shrink-0 mt-0.5",
            hasChildren ? "cursor-pointer" : "invisible"
          )}
        >
          {expanded ? (
            <ChevronDown size={14} className="text-muted-foreground" />
          ) : (
            <ChevronRight size={14} className="text-muted-foreground" />
          )}
        </button>

        {/* Status dot */}
        {isRunning ? (
          <Spinner size={14} className="shrink-0 mt-0.5 text-blue-500" />
        ) : (
          <div
            className={cn(
              "mt-1.5 h-2 w-2 shrink-0 rounded-full",
              TRACE_STATUS_DOT[node.status]
            )}
          />
        )}

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {/* Best star marker */}
            {node.isBest && (
              <Star size={12} className="shrink-0 text-amber-500 fill-amber-500" />
            )}
            <span className={cn("font-medium truncate", isIterationNode && node.decision && !node.decision.accepted && "text-muted-foreground")}>{node.title}</span>
            <StatusBadge status={node.status} />
            {/* Accept/Reject badge */}
            {isIterationNode && node.decision && (
              <span className={cn(
                "inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold shrink-0",
                node.decision.accepted
                  ? "bg-green-100 text-green-700"
                  : "bg-red-100 text-red-700"
              )}>
                {node.decision.accepted ? "Accepted" : "Rejected"}
              </span>
            )}
            {isClickable && (
              <Eye size={12} className="text-muted-foreground/50 shrink-0" />
            )}
            {node.score?.overall !== undefined && (
              <span className="text-xs text-muted-foreground ml-auto shrink-0">
                {formatScore(node.score.overall)}
              </span>
            )}
          </div>

          {/* Focus area chip */}
          {isIterationNode && node.focusArea && (
            <div className="mt-0.5">
              <span className={cn(
                "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium",
                node.focusArea === "layout" && "bg-blue-100 text-blue-700",
                node.focusArea === "style" && "bg-purple-100 text-purple-700",
                node.focusArea === "a11y" && "bg-orange-100 text-orange-700",
                node.focusArea === "perceptual" && "bg-teal-100 text-teal-700",
                !["layout", "style", "a11y", "perceptual"].includes(node.focusArea) && "bg-gray-100 text-gray-700"
              )}>
                Focus: {node.focusArea}
              </span>
            </div>
          )}

          {/* Message */}
          {node.message && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {node.message}
            </p>
          )}

          {/* Score breakdown */}
          {node.score && node.score.layout !== undefined && (
            <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
              <span>Layout: {formatScore(node.score.layout)}</span>
              <span>Style: {formatScore(node.score.style)}</span>
              <span>A11y: {formatScore(node.score.a11y)}</span>
              {node.score.deltaFromPrev !== undefined && (
                <span className={node.score.deltaFromPrev >= 0 ? "text-green-600" : "text-red-600"}>
                  {node.score.deltaFromPrev >= 0 ? "+" : ""}
                  {formatScore(node.score.deltaFromPrev)}
                </span>
              )}
            </div>
          )}

          {/* Artifacts */}
          {node.artifacts && node.artifacts.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {node.artifacts.map((artifact) => (
                <button
                  key={artifact.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    onArtifactClick?.(artifact);
                  }}
                  className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground cursor-pointer transition-colors"
                >
                  <FileDown size={10} />
                  {artifact.label}
                </button>
              ))}
            </div>
          )}

          {/* Duration */}
          {(node.startedAt) && (
            <span className="text-xs text-muted-foreground/60 mt-0.5 block">
              {formatDuration(node.startedAt, node.finishedAt)}
            </span>
          )}
        </div>
      </div>

      {/* Children */}
      {expanded &&
        hasChildren &&
        node.children!.map((child) => (
          <TraceNode
            key={child.nodeId}
            node={child}
            depth={depth + 1}
            defaultExpanded={defaultExpanded}
            onArtifactClick={onArtifactClick}
            onIterationClick={onIterationClick}
          />
        ))}
    </div>
  );
}
