"use client";

import { useState, useEffect, useCallback } from "react";
import { ProjectHeader } from "./ProjectHeader";
import { ThreePaneLayout } from "./ThreePaneLayout";
import { createProject, uploadDesignPack } from "@/lib/api";

interface ProjectWorkspaceProps {
  initialProjectId: string;
}

interface UploadResult {
  type: "success" | "validation_error" | "error";
  packId?: string;
  validationErrors?: string[];
  message?: string;
}

export function ProjectWorkspace({ initialProjectId }: ProjectWorkspaceProps) {
  const [projectId, setProjectId] = useState(initialProjectId);
  const [projectName, setProjectName] = useState("Untitled Project");
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);

  // Auto-create a real project for "demo" or "new" slugs
  useEffect(() => {
    if (initialProjectId === "demo" || initialProjectId === "new") {
      createProject("Dashboard App")
        .then((res) => {
          setProjectId(res.projectId);
          setProjectName(res.name);
          // Update URL without full navigation
          window.history.replaceState(null, "", `/projects/${res.projectId}`);
        })
        .catch((err) => {
          console.error("Failed to create project:", err);
        });
    }
  }, [initialProjectId]);

  const handleDesignPackUpload = useCallback(
    async (file: File) => {
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

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden">
      <ProjectHeader
        projectId={projectId}
        projectName={projectName}
        uploading={uploading}
        onDesignPackUploaded={handleDesignPackUpload}
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
        <ThreePaneLayout projectId={projectId} />
      </div>
    </div>
  );
}
