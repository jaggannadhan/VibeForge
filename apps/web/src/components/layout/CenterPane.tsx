"use client";

import { useState, useEffect, useRef } from "react";
import { Monitor, Image, Camera, FileText, X, Loader2, Star } from "lucide-react";
import type { ArtifactLink } from "@vibe-studio/shared";
import type { SelectedFile } from "@/lib/types";
import { cn } from "@/lib/utils";
import { FileViewer } from "@/components/filetree/FileViewer";
import { PreviewPane } from "./PreviewPane";
import { BaselinePane } from "./BaselinePane";

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api").replace(/\/api$/, "");

type BuiltinTab = "preview" | "baseline" | "artifact";

interface CenterPaneProps {
  projectId: string;
  designDir: string | null;
  refreshKey?: number;
  route?: string;
  viewingArtifact?: ArtifactLink | null;
  onCloseArtifact?: () => void;
  // Historical preview props
  previewMode?: "latest" | "iteration";
  pinnedIterationId?: number | null;
  overridePreviewUrl?: string | null;
  onRefreshLatest?: () => void;
  onFullscreen?: () => void;
  bestIterationId?: number | null;
  onViewBest?: () => void;
  // File tab props
  openFiles?: SelectedFile[];
  activeFileId?: string | null;
  onSelectFileTab?: (path: string) => void;
  onCloseFileTab?: (path: string) => void;
  onClearFileTab?: () => void;
}

export function CenterPane({
  projectId,
  designDir,
  refreshKey,
  route,
  viewingArtifact,
  onCloseArtifact,
  previewMode = "latest",
  pinnedIterationId,
  overridePreviewUrl,
  onRefreshLatest,
  onFullscreen,
  bestIterationId,
  onViewBest,
  openFiles = [],
  activeFileId = null,
  onSelectFileTab,
  onCloseFileTab,
  onClearFileTab,
}: CenterPaneProps) {
  const [activeBuiltinTab, setActiveBuiltinTab] = useState<BuiltinTab>("preview");
  const prevTabRef = useRef<BuiltinTab>("preview");

  // Whether a file tab is currently active
  const isFileActive = activeFileId !== null;
  const activeFile = isFileActive
    ? openFiles.find((f) => f.path === activeFileId) ?? null
    : null;

  // Auto-switch to artifact tab when a new artifact is opened
  useEffect(() => {
    if (viewingArtifact) {
      if (activeBuiltinTab !== "artifact") {
        prevTabRef.current = activeBuiltinTab;
      }
      setActiveBuiltinTab("artifact");
      onClearFileTab?.();
    }
  }, [viewingArtifact]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCloseArtifact = () => {
    setActiveBuiltinTab(prevTabRef.current);
    onCloseArtifact?.();
  };

  const handleBuiltinTabClick = (tab: BuiltinTab) => {
    setActiveBuiltinTab(tab);
    onClearFileTab?.();
  };

  const builtinTabClass = (tab: BuiltinTab) =>
    cn(
      "flex items-center gap-1.5 px-3 py-2 text-xs font-semibold uppercase tracking-wider transition-colors",
      !isFileActive && activeBuiltinTab === tab
        ? "text-foreground border-b-2 border-primary"
        : "text-muted-foreground hover:text-foreground/70"
    );

  const fileTabClass = (path: string) =>
    cn(
      "flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors",
      isFileActive && activeFileId === path
        ? "text-foreground border-b-2 border-primary"
        : "text-muted-foreground hover:text-foreground/70"
    );

  return (
    <div className="flex h-full flex-col">
      {/* Tab bar */}
      <div className="flex items-center gap-0 border-b overflow-x-auto">
        <button onClick={() => handleBuiltinTabClick("preview")} className={builtinTabClass("preview")}>
          <Monitor size={14} />
          Preview
        </button>
        <button onClick={() => handleBuiltinTabClick("baseline")} className={builtinTabClass("baseline")}>
          <Image size={14} />
          Baseline
        </button>

        {/* File tabs */}
        {openFiles.map((file) => (
          <button
            key={file.path}
            onClick={() => onSelectFileTab?.(file.path)}
            className={fileTabClass(file.path)}
          >
            <FileText size={12} />
            {file.name}
            <span
              role="button"
              onClick={(e) => {
                e.stopPropagation();
                onCloseFileTab?.(file.path);
              }}
              className="ml-1 rounded p-0.5 hover:bg-muted-foreground/20 transition-colors"
            >
              <X size={10} />
            </span>
          </button>
        ))}

        {viewingArtifact && (
          <button onClick={() => handleBuiltinTabClick("artifact")} className={builtinTabClass("artifact")}>
            <Camera size={14} />
            {viewingArtifact.label}
            <span
              role="button"
              onClick={(e) => {
                e.stopPropagation();
                handleCloseArtifact();
              }}
              className="ml-1 rounded p-0.5 hover:bg-muted-foreground/20 transition-colors"
            >
              <X size={10} />
            </span>
          </button>
        )}

        {/* Right-side controls */}
        <div className="ml-auto flex items-center gap-1 pr-2">
          {/* Pinned iteration chip */}
          {previewMode === "iteration" && pinnedIterationId != null && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
              Pinned: Iteration {pinnedIterationId + 1}
            </span>
          )}

          {/* View Best button */}
          {bestIterationId != null && (
            <button
              onClick={onViewBest}
              className="rounded p-1.5 hover:bg-accent transition-colors"
              title={`View Best (Iteration ${bestIterationId + 1})`}
            >
              <Star size={14} className="text-amber-500" />
            </button>
          )}
        </div>
      </div>

      {/* Tab content — preview & baseline stay mounted to preserve iframe state */}
      <div className="flex-1 overflow-hidden relative">
        <div className={cn("absolute inset-0", (isFileActive || activeBuiltinTab !== "preview") && "invisible")}>
          <PreviewPane
            projectId={projectId}
            refreshKey={refreshKey}
            route={route}
            overridePreviewUrl={overridePreviewUrl}
            onFullscreen={onFullscreen}
            onRefreshLatest={onRefreshLatest}
          />
        </div>
        <div className={cn("absolute inset-0", (isFileActive || activeBuiltinTab !== "baseline") && "invisible")}>
          <BaselinePane projectId={projectId} designDir={designDir} />
        </div>
        {/* Historical preview loading overlay */}
        {!isFileActive && activeBuiltinTab === "preview" && previewMode === "iteration" && !overridePreviewUrl && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-3 text-center">
              <Loader2 size={32} className="animate-spin text-amber-500" />
              <p className="text-sm font-medium text-foreground/80">
                Starting historical preview...
              </p>
              <p className="text-xs text-muted-foreground/60">
                Installing dependencies and starting dev server
              </p>
            </div>
          </div>
        )}
        {viewingArtifact && !isFileActive && activeBuiltinTab === "artifact" && (
          <div className="absolute inset-0 flex items-center justify-center overflow-auto bg-muted/30 p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`${API_BASE}${viewingArtifact.href}`}
              alt={viewingArtifact.label}
              className="max-h-full max-w-full object-contain rounded shadow-sm"
            />
          </div>
        )}
        {/* Active file tab content */}
        {isFileActive && activeFile && (
          <div className="absolute inset-0">
            <FileViewer file={activeFile} />
          </div>
        )}
      </div>
    </div>
  );
}
