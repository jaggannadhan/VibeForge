"use client";

import { useState, useEffect, useCallback } from "react";
import type { ArtifactLink } from "@vibe-studio/shared";
import { ProjectHeader } from "./ProjectHeader";
import { ThreePaneLayout } from "./ThreePaneLayout";
import { Spinner } from "@/components/common/Spinner";
import { createProject, uploadDesignPack, startRun, stopRun } from "@/lib/api";

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

  const handleArtifactClick = useCallback((artifact: ArtifactLink) => {
    setViewingArtifact(artifact);
  }, []);

  const handleCloseArtifact = useCallback(() => {
    setViewingArtifact(null);
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
        />
      </div>
    </div>
  );
}
