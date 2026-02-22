"use client";

import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import type { ArtifactLink } from "@vibe-studio/shared";
import { FileTreePane } from "./FileTreePane";
import { CenterPane } from "./CenterPane";
import { TracePane } from "./TracePane";

interface ThreePaneLayoutProps {
  projectId: string;
  fileTreeRefreshKey?: number;
  runActive?: boolean;
  onRunComplete?: () => void;
  previewAutoStart?: boolean;
  previewRefreshKey?: number;
  previewRoute?: string;
  packId?: string | null;
  viewingArtifact?: ArtifactLink | null;
  onArtifactClick?: (artifact: ArtifactLink) => void;
  onCloseArtifact?: () => void;
  // Historical preview props
  previewMode?: "latest" | "iteration";
  pinnedIterationId?: number | null;
  overridePreviewUrl?: string | null;
  onRefreshLatest?: () => void;
  onFullscreen?: () => void;
  onIterationClick?: (iterationIndex: number) => void;
  bestIterationId?: number | null;
  onViewBest?: () => void;
  onBestUpdated?: (bestIterationId: number | null) => void;
}

export function ThreePaneLayout({
  projectId,
  fileTreeRefreshKey,
  runActive = false,
  onRunComplete,
  previewAutoStart,
  previewRefreshKey,
  previewRoute,
  packId,
  viewingArtifact,
  onArtifactClick,
  onCloseArtifact,
  previewMode,
  pinnedIterationId,
  overridePreviewUrl,
  onRefreshLatest,
  onFullscreen,
  onIterationClick,
  bestIterationId,
  onViewBest,
  onBestUpdated,
}: ThreePaneLayoutProps) {
  return (
    <ResizablePanelGroup direction="horizontal" className="h-full w-full">
      {/* Left pane — File Tree + Viewer */}
      <ResizablePanel defaultSize={25} minSize={15} maxSize={40}>
        <FileTreePane projectId={projectId} refreshKey={fileTreeRefreshKey} />
      </ResizablePanel>

      <ResizableHandle withHandle />

      {/* Center pane — Preview + Baseline tabs */}
      <ResizablePanel defaultSize={50} minSize={30}>
        <CenterPane
          projectId={projectId}
          packId={packId ?? null}
          autoStart={previewAutoStart}
          refreshKey={previewRefreshKey}
          route={previewRoute}
          viewingArtifact={viewingArtifact}
          onCloseArtifact={onCloseArtifact}
          previewMode={previewMode}
          pinnedIterationId={pinnedIterationId}
          overridePreviewUrl={overridePreviewUrl}
          onRefreshLatest={onRefreshLatest}
          onFullscreen={onFullscreen}
          bestIterationId={bestIterationId}
          onViewBest={onViewBest}
        />
      </ResizablePanel>

      <ResizableHandle withHandle />

      {/* Right pane — Agent Trace */}
      <ResizablePanel defaultSize={25} minSize={15} maxSize={40}>
        <TracePane
          projectId={projectId}
          runActive={runActive}
          onRunComplete={onRunComplete}
          onArtifactClick={onArtifactClick}
          onIterationClick={onIterationClick}
          onBestUpdated={onBestUpdated}
        />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
