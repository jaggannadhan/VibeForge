"use client";

import { useState, useEffect, useRef } from "react";
import { Monitor, Image, Camera, X } from "lucide-react";
import type { ArtifactLink } from "@vibe-studio/shared";
import { cn } from "@/lib/utils";
import { PreviewPane } from "./PreviewPane";
import { BaselinePane } from "./BaselinePane";

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api").replace(/\/api$/, "");

type Tab = "preview" | "baseline" | "artifact";

interface CenterPaneProps {
  projectId: string;
  packId: string | null;
  autoStart?: boolean;
  refreshKey?: number;
  route?: string;
  viewingArtifact?: ArtifactLink | null;
  onCloseArtifact?: () => void;
}

export function CenterPane({
  projectId,
  packId,
  autoStart,
  refreshKey,
  route,
  viewingArtifact,
  onCloseArtifact,
}: CenterPaneProps) {
  const [activeTab, setActiveTab] = useState<Tab>("preview");
  const prevTabRef = useRef<Tab>("preview");

  // Auto-switch to artifact tab when a new artifact is opened
  useEffect(() => {
    if (viewingArtifact) {
      if (activeTab !== "artifact") {
        prevTabRef.current = activeTab;
      }
      setActiveTab("artifact");
    }
  }, [viewingArtifact]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCloseArtifact = () => {
    setActiveTab(prevTabRef.current);
    onCloseArtifact?.();
  };

  const tabClass = (tab: Tab) =>
    cn(
      "flex items-center gap-1.5 px-3 py-2 text-xs font-semibold uppercase tracking-wider transition-colors",
      activeTab === tab
        ? "text-foreground border-b-2 border-primary"
        : "text-muted-foreground hover:text-foreground/70"
    );

  return (
    <div className="flex h-full flex-col">
      {/* Tab bar */}
      <div className="flex items-center gap-0 border-b">
        <button onClick={() => setActiveTab("preview")} className={tabClass("preview")}>
          <Monitor size={14} />
          Preview
        </button>
        <button onClick={() => setActiveTab("baseline")} className={tabClass("baseline")}>
          <Image size={14} />
          Baseline
        </button>
        {viewingArtifact && (
          <button onClick={() => setActiveTab("artifact")} className={tabClass("artifact")}>
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
      </div>

      {/* Tab content — preview & baseline stay mounted to preserve iframe state */}
      <div className="flex-1 overflow-hidden relative">
        <div className={cn("absolute inset-0", activeTab !== "preview" && "invisible")}>
          <PreviewPane
            projectId={projectId}
            autoStart={autoStart}
            refreshKey={refreshKey}
            route={route}
          />
        </div>
        <div className={cn("absolute inset-0", activeTab !== "baseline" && "invisible")}>
          <BaselinePane projectId={projectId} packId={packId} />
        </div>
        {viewingArtifact && activeTab === "artifact" && (
          <div className="absolute inset-0 flex items-center justify-center overflow-auto bg-muted/30 p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`${API_BASE}${viewingArtifact.href}`}
              alt={viewingArtifact.label}
              className="max-h-full max-w-full object-contain rounded shadow-sm"
            />
          </div>
        )}
      </div>
    </div>
  );
}
