"use client";

import { useState, useEffect, useCallback } from "react";
import type { ArtifactLink } from "@vibe-studio/shared";
import { ProjectHeader } from "./ProjectHeader";
import { ThreePaneLayout } from "./ThreePaneLayout";
import { FullscreenPreview } from "./FullscreenPreview";
import { NewProjectOverlay } from "./NewProjectOverlay";
import { Spinner } from "@/components/common/Spinner";
import {
  createProject,
  getProject,
  renameProject,
  startRun,
  stopRun,
  startHistoricalPreview,
  getHistoricalPreviewStatus,
  warmupHistoricalPreview,
  getLatestPreview,
} from "@/lib/api";

interface ProjectWorkspaceProps {
  initialProjectId: string;
}

const PLACEHOLDER_SLUGS = new Set(["demo", "new"]);

export function ProjectWorkspace({ initialProjectId }: ProjectWorkspaceProps) {
  const needsAutoCreate = PLACEHOLDER_SLUGS.has(initialProjectId);
  const [projectId, setProjectId] = useState<string | null>(
    needsAutoCreate ? null : initialProjectId
  );
  const [projectName, setProjectName] = useState("Untitled Project");
  const [fileTreeRefreshKey, setFileTreeRefreshKey] = useState(0);
  const [activeDesignDir, setActiveDesignDir] = useState<string | null>(null);
  const [runActive, setRunActive] = useState(false);
  const [previewRefreshKey, setPreviewRefreshKey] = useState(0);
  const [targetRoute, setTargetRoute] = useState("/");
  const [viewingArtifact, setViewingArtifact] = useState<ArtifactLink | null>(null);
  const [showOverlay, setShowOverlay] = useState(false);
  const [autoExpandPaths, setAutoExpandPaths] = useState<string[]>([]);

  // Historical preview state
  const [previewMode, setPreviewMode] = useState<"latest" | "iteration">("latest");
  const [pinnedIterationId, setPinnedIterationId] = useState<number | null>(null);
  const [overridePreviewUrl, setOverridePreviewUrl] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenUrl, setFullscreenUrl] = useState<string | null>(null);
  const [bestIterationId, setBestIterationId] = useState<number | null>(null);

  const handleRename = useCallback(
    async (name: string) => {
      if (!projectId) return;
      await renameProject(projectId, name);
      setProjectName(name);
    },
    [projectId]
  );

  const handleArtifactClick = useCallback((artifact: ArtifactLink) => {
    setViewingArtifact(artifact);
  }, []);

  const handleCloseArtifact = useCallback(() => {
    setViewingArtifact(null);
  }, []);

  const [historicalLoading, setHistoricalLoading] = useState(false);

  const handleIterationClick = useCallback(
    async (iterationIndex: number) => {
      if (!projectId) return;
      try {
        setHistoricalLoading(true);
        setPreviewMode("iteration");
        setPinnedIterationId(iterationIndex);
        setOverridePreviewUrl(null); // clear while loading

        // Kick off the historical preview server
        const result = await startHistoricalPreview(projectId, iterationIndex);

        let previewUrl: string | null = null;

        if (result.status === "ready") {
          previewUrl = result.previewUrl;
        } else {
          // Poll until the preview server is ready (or fails)
          const MAX_POLLS = 90; // 90 × 2s = 3 minutes max
          for (let i = 0; i < MAX_POLLS; i++) {
            await new Promise((r) => setTimeout(r, 2000));
            try {
              const status = await getHistoricalPreviewStatus(projectId, iterationIndex);
              if (status.status === "ready") {
                previewUrl = status.previewUrl;
                break;
              }
              if (status.status === "error" || status.status === "stopped") {
                console.error("Historical preview failed:", status);
                return;
              }
            } catch {
              // Ignore transient fetch errors, keep polling
            }
          }
        }

        if (!previewUrl) {
          console.error("Historical preview timed out — no URL");
          return;
        }

        // Wait for the route to compile via the backend warmup endpoint.
        // The frontend can't check HTTP status codes directly due to CORS
        // (no-cors returns opaque responses that hide 404 vs 200).
        try {
          await warmupHistoricalPreview(projectId, iterationIndex, targetRoute);
        } catch (warmupErr) {
          console.warn("Warmup request failed, proceeding anyway:", warmupErr);
        }

        setOverridePreviewUrl(previewUrl);
      } catch (err) {
        console.error("Failed to start historical preview:", err);
      } finally {
        setHistoricalLoading(false);
      }
    },
    [projectId, targetRoute]
  );

  const handleRefreshLatest = useCallback(async () => {
    if (!projectId) return;
    setPreviewMode("latest");
    setPinnedIterationId(null);
    setOverridePreviewUrl(null);
    setPreviewRefreshKey((prev) => prev + 1);
  }, [projectId]);

  const handleFullscreen = useCallback(async () => {
    if (!projectId) return;
    const route = targetRoute && targetRoute !== "/" ? targetRoute : "";
    if (overridePreviewUrl) {
      // Iteration mode — URL already known
      setFullscreenUrl(overridePreviewUrl.replace(/\/$/, "") + route);
      setIsFullscreen(true);
    } else {
      // Latest mode — fetch current preview URL
      try {
        const info = await getLatestPreview(projectId);
        if (info.previewUrl) {
          setFullscreenUrl(info.previewUrl.replace(/\/$/, "") + route);
          setIsFullscreen(true);
        }
      } catch (err) {
        console.error("Failed to get preview URL for fullscreen:", err);
      }
    }
  }, [projectId, overridePreviewUrl, targetRoute]);

  const handleExitFullscreen = useCallback(() => {
    setIsFullscreen(false);
    setFullscreenUrl(null);
  }, []);

  const handleViewBest = useCallback(() => {
    if (bestIterationId != null) {
      handleIterationClick(bestIterationId);
    }
  }, [bestIterationId, handleIterationClick]);

  const handleBestUpdated = useCallback((newBestId: number | null) => {
    setBestIterationId(newBestId);
  }, []);

  // Auto-create a real project for placeholder slugs, or verify existing project exists
  useEffect(() => {
    if (needsAutoCreate) {
      createProject("Dashboard App")
        .then((res) => {
          setProjectId(res.projectId);
          setProjectName(res.name);
          window.history.replaceState(null, "", `/projects/${res.projectId}`);
        })
        .catch((err) => {
          console.error("Failed to create project:", err);
        });
    } else if (projectId) {
      // Verify the project still exists on the backend
      getProject(projectId)
        .then((meta) => {
          if (!meta) {
            // Project was deleted — redirect to create a new one
            console.warn(`Project ${projectId} not found, creating a new one`);
            setProjectId(null);
            window.history.replaceState(null, "", "/projects/new");
            return createProject("Dashboard App").then((res) => {
              setProjectId(res.projectId);
              setProjectName(res.name);
              window.history.replaceState(null, "", `/projects/${res.projectId}`);
            });
          }
          setProjectName(meta.name ?? "Untitled Project");
        })
        .catch((err) => {
          console.error("Failed to verify project:", err);
        });
    }
  }, [needsAutoCreate]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleNewProjectComplete = useCallback(
    (designDir: string, defaultRoute: string) => {
      setActiveDesignDir(designDir);
      if (defaultRoute) setTargetRoute(defaultRoute);
      setFileTreeRefreshKey((prev) => prev + 1);
      setShowOverlay(false);

      // Auto-expand the new designs directory in the file tree
      // designDir is like "src/designs/h-care"
      const parts = designDir.split("/");
      const expandPaths: string[] = [];
      for (let i = 1; i <= parts.length; i++) {
        expandPaths.push(parts.slice(0, i).join("/"));
      }
      setAutoExpandPaths(expandPaths);
    },
    []
  );

  const handleRun = useCallback(async () => {
    if (!projectId || !activeDesignDir) return;
    try {
      await startRun(projectId, activeDesignDir);
      setRunActive(true);
      // Reset to latest mode when a new run starts
      setPreviewMode("latest");
      setPinnedIterationId(null);
      setOverridePreviewUrl(null);
    } catch (err) {
      console.error("Failed to start run:", err);
    }
  }, [projectId, activeDesignDir]);

  const handleStop = useCallback(async () => {
    if (!projectId) return;
    try {
      await stopRun(projectId);
      setRunActive(false);
    } catch (err) {
      console.error("Failed to stop run:", err);
    }
  }, [projectId]);

  const handleRunComplete = useCallback(() => {
    setRunActive(false);
    setFileTreeRefreshKey((prev) => prev + 1);
    setPreviewRefreshKey((prev) => prev + 1);
  }, []);

  // Show a loading state while the project is being created
  if (!projectId) {
    return (
      <div className="flex h-screen w-screen items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Spinner size={24} />
          <p className="text-sm text-muted-foreground">Creating project...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden">
      <ProjectHeader
        projectId={projectId}
        projectName={projectName}
        canRun={!!activeDesignDir}
        runActive={runActive}
        onNewProject={() => setShowOverlay(true)}
        onRun={handleRun}
        onStop={handleStop}
        onRename={handleRename}
      />

      <div className="flex-1 overflow-hidden">
        <ThreePaneLayout
          projectId={projectId}
          fileTreeRefreshKey={fileTreeRefreshKey}
          runActive={runActive}
          onRunComplete={handleRunComplete}
          previewRefreshKey={previewRefreshKey}
          previewRoute={targetRoute}
          designDir={activeDesignDir}
          viewingArtifact={viewingArtifact}
          onArtifactClick={handleArtifactClick}
          onCloseArtifact={handleCloseArtifact}
          previewMode={previewMode}
          pinnedIterationId={pinnedIterationId}
          overridePreviewUrl={overridePreviewUrl}
          onRefreshLatest={handleRefreshLatest}
          onFullscreen={handleFullscreen}
          onIterationClick={handleIterationClick}
          bestIterationId={bestIterationId}
          onViewBest={handleViewBest}
          onBestUpdated={handleBestUpdated}
          autoExpandPaths={autoExpandPaths}
        />
      </div>

      {isFullscreen && fullscreenUrl && (
        <FullscreenPreview previewUrl={fullscreenUrl} onExit={handleExitFullscreen} />
      )}

      {showOverlay && (
        <NewProjectOverlay
          projectId={projectId}
          projectName={projectName}
          onClose={() => setShowOverlay(false)}
          onComplete={handleNewProjectComplete}
        />
      )}
    </div>
  );
}
