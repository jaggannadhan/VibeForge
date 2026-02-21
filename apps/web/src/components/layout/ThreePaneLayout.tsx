"use client";

import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { FileTreePane } from "./FileTreePane";
import { PreviewPane } from "./PreviewPane";
import { TracePane } from "./TracePane";

interface ThreePaneLayoutProps {
  projectId: string;
  fileTreeRefreshKey?: number;
  runActive?: boolean;
  onRunComplete?: () => void;
  previewAutoStart?: boolean;
  previewRefreshKey?: number;
  previewRoute?: string;
}

export function ThreePaneLayout({
  projectId,
  fileTreeRefreshKey,
  runActive = false,
  onRunComplete,
  previewAutoStart,
  previewRefreshKey,
  previewRoute,
}: ThreePaneLayoutProps) {
  return (
    <ResizablePanelGroup direction="horizontal" className="h-full w-full">
      {/* Left pane — File Tree + Viewer */}
      <ResizablePanel defaultSize={25} minSize={15} maxSize={40}>
        <FileTreePane projectId={projectId} refreshKey={fileTreeRefreshKey} />
      </ResizablePanel>

      <ResizableHandle withHandle />

      {/* Center pane — Live Preview */}
      <ResizablePanel defaultSize={50} minSize={30}>
        <PreviewPane
          projectId={projectId}
          autoStart={previewAutoStart}
          refreshKey={previewRefreshKey}
          route={previewRoute}
        />
      </ResizablePanel>

      <ResizableHandle withHandle />

      {/* Right pane — Agent Trace */}
      <ResizablePanel defaultSize={25} minSize={15} maxSize={40}>
        <TracePane projectId={projectId} runActive={runActive} onRunComplete={onRunComplete} />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
