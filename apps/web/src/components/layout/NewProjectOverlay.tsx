"use client";

import { useState, useRef, useCallback } from "react";
import { X, Upload, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  uploadDesignZip,
  createDesignFiles,
  type DesignZipUploadResponse,
} from "@/lib/api";

interface NewProjectOverlayProps {
  projectId: string;
  projectName: string;
  onClose: () => void;
  onComplete: (designDir: string, defaultRoute: string) => void;
}

type OverlayStep = "upload" | "create" | "generating" | "done" | "error";

export function NewProjectOverlay({
  projectId,
  projectName,
  onClose,
  onComplete,
}: NewProjectOverlayProps) {
  const [step, setStep] = useState<OverlayStep>("upload");
  const [name, setName] = useState(projectName);
  const [dragOver, setDragOver] = useState(false);
  const [uploadResult, setUploadResult] = useState<DesignZipUploadResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.name.endsWith(".zip")) {
        setErrorMessage("Please upload a .zip file containing design images.");
        setStep("error");
        return;
      }

      setStep("generating"); // show spinner during upload too
      setErrorMessage(null);

      try {
        const result = await uploadDesignZip(projectId, file);
        setUploadResult(result);
        setStep("create");
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : "Upload failed");
        setStep("error");
      }
    },
    [projectId]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
      e.target.value = "";
    },
    [handleFile]
  );

  const handleCreateDesignFiles = useCallback(async () => {
    if (!uploadResult) return;
    setStep("generating");
    setErrorMessage(null);

    try {
      const result = await createDesignFiles(
        projectId,
        uploadResult.uploadId,
        name.trim() || "Untitled"
      );
      setStep("done");
      // Auto-close after brief delay
      setTimeout(() => {
        onComplete(result.designDir, result.defaultRoute);
      }, 800);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Design file generation failed"
      );
      setStep("error");
    }
  }, [projectId, uploadResult, name, onComplete]);

  const canClose = step !== "generating";

  const detectedSummary = uploadResult?.detected;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-sm">
      {/* Close button */}
      {canClose && (
        <button
          onClick={onClose}
          className="absolute top-4 right-4 rounded-md p-2 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <X size={20} />
        </button>
      )}

      <div className="w-full max-w-lg px-6">
        {/* ── Upload step ───────────────────────────────────────── */}
        {step === "upload" && (
          <div className="flex flex-col items-center gap-6">
            <div className="text-center">
              <h2 className="text-xl font-semibold text-foreground">
                New Project
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Upload design images to generate project files
              </p>
            </div>

            {/* Project name input */}
            <div className="w-full">
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                Project Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
                placeholder="My Project"
              />
            </div>

            {/* Drop zone */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                "w-full cursor-pointer rounded-lg border-2 border-dashed p-10 text-center transition-colors",
                dragOver
                  ? "border-primary bg-primary/5"
                  : "border-muted-foreground/25 hover:border-muted-foreground/50"
              )}
            >
              <Upload
                size={32}
                className="mx-auto mb-3 text-muted-foreground/50"
              />
              <p className="text-sm font-medium text-foreground/70">
                Drop a .zip file here, or click to browse
              </p>
              <p className="mt-1.5 text-xs text-muted-foreground/60">
                Upload a zip containing images (desktop/default.png,
                mobile/default.png optional)
              </p>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".zip"
              className="hidden"
              onChange={handleInputChange}
            />
          </div>
        )}

        {/* ── Create step (after upload, before generation) ───── */}
        {step === "create" && detectedSummary && (
          <div className="flex flex-col items-center gap-6">
            <div className="text-center">
              <h2 className="text-xl font-semibold text-foreground">
                Images Uploaded
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Ready to generate design files
              </p>
            </div>

            {/* Detected breakpoints summary */}
            <div className="w-full rounded-md border bg-muted/30 p-4 text-sm">
              <p className="font-medium text-foreground/80 mb-2">
                Detected breakpoints:
              </p>
              <ul className="space-y-1 text-muted-foreground">
                {detectedSummary.desktop.exists && (
                  <li>
                    Desktop:{" "}
                    {"width" in detectedSummary.desktop
                      ? `${detectedSummary.desktop.width} x ${detectedSummary.desktop.height}`
                      : "detected"}
                  </li>
                )}
                {detectedSummary.mobile.exists && (
                  <li>
                    Mobile:{" "}
                    {"width" in detectedSummary.mobile
                      ? `${detectedSummary.mobile.width} x ${detectedSummary.mobile.height}`
                      : "detected"}
                  </li>
                )}
                {!detectedSummary.desktop.exists &&
                  !detectedSummary.mobile.exists && (
                    <li>Images detected (fallback to desktop)</li>
                  )}
              </ul>
              {detectedSummary.states.length > 0 && (
                <p className="mt-2 text-xs text-muted-foreground/60">
                  States: {detectedSummary.states.join(", ")}
                </p>
              )}
            </div>

            <button
              onClick={handleCreateDesignFiles}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Create design files
            </button>
          </div>
        )}

        {/* ── Generating step ──────────────────────────────────── */}
        {step === "generating" && (
          <div className="flex flex-col items-center gap-4 text-center">
            <Loader2 size={36} className="animate-spin text-primary" />
            <div>
              <p className="text-sm font-medium text-foreground/80">
                Generating design files...
              </p>
              <p className="mt-1 text-xs text-muted-foreground/60">
                Creating manifest, design IR, and organizing baselines
              </p>
            </div>
          </div>
        )}

        {/* ── Done step ────────────────────────────────────────── */}
        {step === "done" && (
          <div className="flex flex-col items-center gap-4 text-center">
            <CheckCircle size={36} className="text-green-500" />
            <p className="text-sm font-medium text-foreground/80">
              Design files generated successfully
            </p>
          </div>
        )}

        {/* ── Error step ───────────────────────────────────────── */}
        {step === "error" && (
          <div className="flex flex-col items-center gap-4 text-center">
            <AlertCircle size={36} className="text-red-500" />
            <div>
              <p className="text-sm font-medium text-red-600">
                {errorMessage || "Something went wrong"}
              </p>
            </div>
            <button
              onClick={() => {
                setStep("upload");
                setUploadResult(null);
                setErrorMessage(null);
              }}
              className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent transition-colors"
            >
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
