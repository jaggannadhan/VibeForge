"use client";

import { useState } from "react";
import type { FileTreeNode } from "@vibe-studio/shared";
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

interface FileTreeProps {
  nodes: FileTreeNode[];
  selectedPath: string | null;
  onSelectFile: (path: string) => void;
}

interface TreeNodeProps {
  node: FileTreeNode;
  depth: number;
  selectedPath: string | null;
  onSelectFile: (path: string) => void;
  expandedPaths: Set<string>;
  toggleExpanded: (path: string) => void;
}

const STATUS_COLORS: Record<string, string> = {
  added: "text-green-600",
  modified: "text-yellow-600",
  untracked: "text-gray-400",
};

function TreeNode({
  node,
  depth,
  selectedPath,
  onSelectFile,
  expandedPaths,
  toggleExpanded,
}: TreeNodeProps) {
  const isExpanded = expandedPaths.has(node.path);
  const isSelected = selectedPath === node.path;
  const paddingLeft = 12 + depth * 16;

  if (node.type === "directory") {
    return (
      <div>
        <button
          onClick={() => toggleExpanded(node.path)}
          className={cn(
            "flex w-full items-center gap-1 py-1 pr-2 text-sm hover:bg-accent/50 transition-colors",
          )}
          style={{ paddingLeft }}
        >
          {isExpanded ? (
            <ChevronDown size={14} className="shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight size={14} className="shrink-0 text-muted-foreground" />
          )}
          {isExpanded ? (
            <FolderOpen size={14} className="shrink-0 text-blue-500" />
          ) : (
            <Folder size={14} className="shrink-0 text-blue-500" />
          )}
          <span className="truncate font-medium">{node.name}</span>
        </button>
        {isExpanded &&
          node.children?.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              onSelectFile={onSelectFile}
              expandedPaths={expandedPaths}
              toggleExpanded={toggleExpanded}
            />
          ))}
      </div>
    );
  }

  return (
    <button
      onClick={() => onSelectFile(node.path)}
      className={cn(
        "flex w-full items-center gap-1 py-1 pr-2 text-sm transition-colors",
        isSelected ? "bg-accent text-accent-foreground" : "hover:bg-accent/50"
      )}
      style={{ paddingLeft: paddingLeft + 14 }}
    >
      <FileText size={14} className="shrink-0 text-muted-foreground" />
      <span className={cn("truncate", node.status && STATUS_COLORS[node.status])}>
        {node.name}
      </span>
      {node.status && (
        <span
          className={cn(
            "ml-auto text-xs shrink-0",
            STATUS_COLORS[node.status]
          )}
        >
          {node.status === "added" ? "A" : node.status === "modified" ? "M" : "U"}
        </span>
      )}
    </button>
  );
}

function getDefaultExpanded(nodes: FileTreeNode[], depth = 0): Set<string> {
  const paths = new Set<string>();
  for (const node of nodes) {
    if (node.type === "directory" && depth < 2) {
      paths.add(node.path);
      if (node.children) {
        for (const p of getDefaultExpanded(node.children, depth + 1)) {
          paths.add(p);
        }
      }
    }
  }
  return paths;
}

export function FileTree({ nodes, selectedPath, onSelectFile }: FileTreeProps) {
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(
    () => getDefaultExpanded(nodes)
  );

  const toggleExpanded = (path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  return (
    <ScrollArea className="h-full">
      <div className="py-1">
        {nodes.map((node) => (
          <TreeNode
            key={node.path}
            node={node}
            depth={0}
            selectedPath={selectedPath}
            onSelectFile={onSelectFile}
            expandedPaths={expandedPaths}
            toggleExpanded={toggleExpanded}
          />
        ))}
      </div>
    </ScrollArea>
  );
}
