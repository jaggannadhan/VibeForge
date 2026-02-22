"use client";

import { useState, useEffect, useCallback } from "react";
import type { FileTreeNode } from "@vibe-studio/shared";
import { getFileTree } from "@/lib/api";
import { FileTree } from "@/components/filetree/FileTree";
import { Spinner } from "@/components/common/Spinner";

interface FileTreePaneProps {
  projectId: string;
  refreshKey?: number;
  onOpenFile: (path: string) => void;
  autoExpandPaths?: string[];
}

export function FileTreePane({ projectId, refreshKey, onOpenFile, autoExpandPaths }: FileTreePaneProps) {
  const [files, setFiles] = useState<FileTreeNode[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let stale = false;
    setLoading(true);
    getFileTree(projectId)
      .then((res) => {
        if (!stale) {
          setFiles(res.files);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!stale) {
          setFiles([]);
          setLoading(false);
        }
      });
    return () => { stale = true; };
  }, [projectId, refreshKey]);

  const handleSelectFile = useCallback(
    (path: string) => {
      setSelectedPath(path);
      onOpenFile(path);
    },
    [onOpenFile]
  );

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size={20} />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-3 py-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Files
        </h3>
      </div>
      <div className="flex-1 overflow-hidden">
        <FileTree
          nodes={files}
          selectedPath={selectedPath}
          onSelectFile={handleSelectFile}
          autoExpandPaths={autoExpandPaths}
        />
      </div>
    </div>
  );
}
