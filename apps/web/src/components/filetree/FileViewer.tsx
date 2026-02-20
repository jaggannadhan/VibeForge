"use client";

import { FileText } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { SelectedFile } from "@/lib/types";

interface FileViewerProps {
  file: SelectedFile | null;
}

export function FileViewer({ file }: FileViewerProps) {
  if (!file) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <div className="text-center">
          <FileText size={32} className="mx-auto mb-2 opacity-40" />
          <p className="text-sm">Select a file to view</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b bg-muted/30 px-3 py-1.5">
        <FileText size={14} className="text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">
          {file.path}
        </span>
        <span className="ml-auto text-xs text-muted-foreground/60">
          {file.language}
        </span>
      </div>
      <ScrollArea className="flex-1">
        <pre className="p-4 text-sm leading-relaxed">
          <code>{file.content}</code>
        </pre>
      </ScrollArea>
    </div>
  );
}
