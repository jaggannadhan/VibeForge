"use client";

import { useState } from "react";
import type { IterationNode } from "@vibe-studio/shared";
import { ChevronRight, ChevronDown, FileDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/common/Badge";
import { Spinner } from "@/components/common/Spinner";
import { TRACE_STATUS_DOT } from "@/lib/types";

interface TraceNodeProps {
  node: IterationNode;
  depth?: number;
  defaultExpanded?: boolean;
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

export function TraceNode({ node, depth = 0, defaultExpanded = true }: TraceNodeProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const hasChildren = node.children && node.children.length > 0;
  const isRunning = node.status === "running";
  const paddingLeft = 8 + depth * 16;

  return (
    <div>
      <div
        className={cn(
          "flex items-start gap-2 py-1.5 pr-3 text-sm hover:bg-accent/30 transition-colors",
          isRunning && "bg-blue-50/50"
        )}
        style={{ paddingLeft }}
      >
        {/* Expand/collapse toggle */}
        <button
          onClick={() => hasChildren && setExpanded(!expanded)}
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
            <span className="font-medium truncate">{node.title}</span>
            <StatusBadge status={node.status} />
            {node.score?.overall !== undefined && (
              <span className="text-xs text-muted-foreground ml-auto shrink-0">
                {formatScore(node.score.overall)}
              </span>
            )}
          </div>

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
                <span
                  key={artifact.id}
                  className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
                >
                  <FileDown size={10} />
                  {artifact.label}
                </span>
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
          />
        ))}
    </div>
  );
}
