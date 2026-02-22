"use client";

import { useState, useEffect, useCallback } from "react";
import type { ArtifactLink } from "@vibe-studio/shared";
import { ProjectHeader } from "./ProjectHeader";
import { ThreePaneLayout } from "./ThreePaneLayout";
import { FullscreenPreview } from "./FullscreenPreview";
import { Spinner } from "@/components/common/Spinner";
import {
  createProject,
  uploadDesignPack,
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

interface UploadResult {
  type: "success" | "validation_error" | "error";
  packId?: string;
  validationErrors?: string[];
  message?: string;
}

const PLACEHOLDER_SLUGS = new Set(["demo", "new"]);

export function ProjectWorkspace({ initialProjectId }: ProjectWorkspaceProps) {
  const needsAutoCreate = PLACEHOLDER_SLUGS.has(initialProjectId);
  const [projectId, setProjectId] = useState<string | null>(
    needsAutoCreate ? null : initialProjectId
  );
  const [projectName, setProjectName] = useState("Untitled Project");
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [fileTreeRefreshKey, setFileTreeRefreshKey] = useState(0);
  const [activePackId, setActivePackId] = useState<string | null>(null);
  const [runActive, setRunActive] = useState(false);
  const [previewRefreshKey, setPreviewRefreshKey] = useState(0);
  const [previewAutoStart, setPreviewAutoStart] = useState(false);
  const [targetRoute, setTargetRoute] = useState("/");
  const [viewingArtifact, setViewingArtifact] = useState<ArtifactLink | null>(null);

  // Historical preview state
  const [previewMode, setPreviewMode] = useState<"latest" | "iteration">("latest");
  const [pinnedIterationId, setPinnedIterationId] = useState<number | null>(null);
  const [overridePreviewUrl, setOverridePreviewUrl] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenUrl, setFullscreenUrl] = useState<string | null>(null);
  const [bestIterationId, setBestIterationId] = useState<number | null>(null);

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

  // Auto-create a real project for placeholder slugs
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
    }
  }, [needsAutoCreate]);

  const handleDesignPackUpload = useCallback(
    async (file: File) => {
      if (!projectId) return;
      setUploading(true);
      setUploadResult(null);

      try {
        const result = await uploadDesignPack(projectId, file);

        if (result.validationErrors && result.validationErrors.length > 0) {
          setUploadResult({
            type: "validation_error",
            packId: result.packId,
            validationErrors: result.validationErrors,
          });
        } else {
          setUploadResult({
            type: "success",
            packId: result.packId,
            message: `Design pack ${result.packId} uploaded successfully.`,
          });
          setActivePackId(result.packId);
          if (result.defaultRoute) setTargetRoute(result.defaultRoute);
          setFileTreeRefreshKey((prev) => prev + 1);
        }
      } catch (err) {
        setUploadResult({
          type: "error",
          message: err instanceof Error ? err.message : "Upload failed",
        });
      } finally {
        setUploading(false);
      }
    },
    [projectId]
  );

  const dismissResult = () => setUploadResult(null);

  const handleRun = useCallback(async () => {
    if (!projectId || !activePackId) return;
    try {
      await startRun(projectId, activePackId);
      setRunActive(true);
      // Reset to latest mode when a new run starts
      setPreviewMode("latest");
      setPinnedIterationId(null);
      setOverridePreviewUrl(null);
    } catch (err) {
      console.error("Failed to start run:", err);
    }
  }, [projectId, activePackId]);

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
    setPreviewAutoStart(true);
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
        uploading={uploading}
        onDesignPackUploaded={handleDesignPackUpload}
        canRun={!!activePackId}
        runActive={runActive}
        onRun={handleRun}
        onStop={handleStop}
      />

      {/* Upload result banner */}
      {uploadResult && (
        <div
          className={`flex items-center gap-2 px-4 py-2 text-sm border-b ${
            uploadResult.type === "success"
              ? "bg-green-50 text-green-800 border-green-200"
              : uploadResult.type === "validation_error"
              ? "bg-amber-50 text-amber-800 border-amber-200"
              : "bg-red-50 text-red-800 border-red-200"
          }`}
        >
          <span className="flex-1">
            {uploadResult.type === "success" && uploadResult.message}
            {uploadResult.type === "validation_error" && (
              <>
                <strong>Validation errors</strong> (pack {uploadResult.packId}
                ):{" "}
                {uploadResult.validationErrors?.join("; ")}
              </>
            )}
            {uploadResult.type === "error" && uploadResult.message}
          </span>
          <button
            onClick={dismissResult}
            className="text-current opacity-60 hover:opacity-100 font-medium"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="flex-1 overflow-hidden">
        <ThreePaneLayout
          projectId={projectId}
          fileTreeRefreshKey={fileTreeRefreshKey}
          runActive={runActive}
          onRunComplete={handleRunComplete}
          previewAutoStart={previewAutoStart}
          previewRefreshKey={previewRefreshKey}
          previewRoute={targetRoute}
          packId={activePackId}
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
        />
      </div>

      {isFullscreen && fullscreenUrl && (
        <FullscreenPreview previewUrl={fullscreenUrl} onExit={handleExitFullscreen} />
      )}
    </div>
  );
}
