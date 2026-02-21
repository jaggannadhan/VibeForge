"use client";

import { useState, useEffect, useCallback } from "react";
import type { FileTreeNode } from "@vibe-studio/shared";
import type { SelectedFile } from "@/lib/types";
import { getFileTree, getFileContent } from "@/lib/api";
import { FileTree } from "@/components/filetree/FileTree";
import { FileViewer } from "@/components/filetree/FileViewer";
import { Spinner } from "@/components/common/Spinner";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";

interface FileTreePaneProps {
  projectId: string;
  refreshKey?: number;
}

export function FileTreePane({ projectId, refreshKey }: FileTreePaneProps) {
  const [files, setFiles] = useState<FileTreeNode[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<SelectedFile | null>(null);
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
    async (path: string) => {
      setSelectedPath(path);
      const res = await getFileContent(projectId, path);
      setSelectedFile({
        path: res.path,
        name: path.split("/").pop() || path,
        content: res.content,
        language: res.language,
      });
    },
    [projectId]
  );

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size={20} />
      </div>
    );
  }

  return (
    <ResizablePanelGroup direction="vertical" className="h-full">
      <ResizablePanel defaultSize={40} minSize={20}>
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
            />
          </div>
        </div>
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel defaultSize={60} minSize={20}>
        <FileViewer file={selectedFile} />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
