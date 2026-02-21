"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Monitor, Play, Square, RefreshCw, Loader2, Package, Zap } from "lucide-react";
import {
  startPreview,
  stopPreview,
  getPreviewStatus,
  type PreviewInfo,
} from "@/lib/api";

interface PreviewPaneProps {
  projectId: string;
  autoStart?: boolean;
  refreshKey?: number;
  route?: string;
}

const STATUS_LABELS: Record<PreviewInfo["status"], string> = {
  installing: "Installing dependencies...",
  starting: "Starting dev server...",
  ready: "Ready",
  stopped: "Stopped",
  error: "Error",
};

export function PreviewPane({ projectId, autoStart, refreshKey, route }: PreviewPaneProps) {
  const [preview, setPreview] = useState<PreviewInfo>({
    previewUrl: null,
    status: "stopped",
  });
  const [starting, setStarting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevRefreshKey = useRef(refreshKey);
  const autoStartTriggered = useRef(false);

  // Clean up polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // Start polling when preview is in a transitional state
  const startPolling = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const info = await getPreviewStatus(projectId);
        setPreview(info);
        // Stop polling when we reach a terminal state
        if (info.status === "ready" || info.status === "error" || info.status === "stopped") {
          if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
        }
      } catch {
        // Ignore polling errors
      }
    }, 2000);
  }, [projectId]);

  const handleStart = useCallback(async () => {
    setStarting(true);
    try {
      const info = await startPreview(projectId);
      setPreview(info);
      if (info.status !== "ready") {
        startPolling();
      }
    } catch (err) {
      setPreview({
        previewUrl: null,
        status: "error",
        error: err instanceof Error ? err.message : "Failed to start preview",
      });
    } finally {
      setStarting(false);
    }
  }, [projectId, startPolling]);

  const handleStop = useCallback(async () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    try {
      await stopPreview(projectId);
      setPreview({ previewUrl: null, status: "stopped" });
    } catch {
      // If stop fails, poll for actual status
    }
  }, [projectId]);

  const handleRefresh = useCallback(() => {
    const iframe = document.querySelector<HTMLIFrameElement>(
      "iframe[title='Live Preview']"
    );
    if (iframe) iframe.src = iframe.src;
  }, []);

  // Auto-start preview when autoStart becomes true and preview is stopped
  useEffect(() => {
    if (autoStart && !autoStartTriggered.current && preview.status === "stopped" && !starting) {
      autoStartTriggered.current = true;
      handleStart();
    }
  }, [autoStart, preview.status, starting, handleStart]);

  // Auto-refresh iframe when refreshKey changes and preview is ready
  useEffect(() => {
    if (refreshKey !== undefined && refreshKey !== prevRefreshKey.current) {
      prevRefreshKey.current = refreshKey;
      if (preview.status === "ready") {
        // The backend warmup step already ensured the route compiled,
        // but give a small buffer for any remaining HMR propagation
        const timer = setTimeout(handleRefresh, 2000);
        return () => clearTimeout(timer);
      }
    }
  }, [refreshKey, preview.status, handleRefresh]);

  // Build the full iframe URL including the target route
  const iframeSrc = preview.previewUrl
    ? preview.previewUrl.replace(/\/$/, "") + (route && route !== "/" ? route : "")
    : null;

  // ── Ready state: show iframe ──────────────────────────────────────
  if (preview.status === "ready" && iframeSrc) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-2 border-b px-3 py-1.5">
          <span className="flex items-center gap-1.5 text-xs text-green-600">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
            Live
          </span>
          <span className="text-xs text-muted-foreground/60 truncate">
            {iframeSrc}
          </span>
          <span className="ml-auto flex items-center gap-1">
            <button
              onClick={handleRefresh}
              className="rounded p-1 hover:bg-accent transition-colors"
              title="Refresh preview"
            >
              <RefreshCw size={12} className="text-muted-foreground" />
            </button>
            <button
              onClick={handleStop}
              className="rounded p-1 hover:bg-accent transition-colors"
              title="Stop preview"
            >
              <Square size={12} className="text-muted-foreground" />
            </button>
          </span>
        </div>
        <div className="flex-1">
          <iframe
            src={iframeSrc}
            className="h-full w-full border-0"
            title="Live Preview"
            sandbox="allow-scripts allow-same-origin"
          />
        </div>
      </div>
    );
  }

  // ── Loading state: installing or starting ─────────────────────────
  if (
    preview.status === "installing" ||
    preview.status === "starting" ||
    starting
  ) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-center">
          {preview.status === "installing" ? (
            <Package size={32} className="text-blue-500 animate-pulse" />
          ) : (
            <Zap size={32} className="text-amber-500 animate-pulse" />
          )}
          <div>
            <p className="text-sm font-medium text-foreground/80">
              {STATUS_LABELS[preview.status] || "Starting preview..."}
            </p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              This may take a minute on first run
            </p>
          </div>
          <Loader2 size={16} className="animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  // ── Error state ───────────────────────────────────────────────────
  if (preview.status === "error") {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-center max-w-sm">
          <Monitor size={48} className="text-red-400 opacity-40" />
          <p className="text-sm font-medium text-red-600">
            Preview failed to start
          </p>
          {preview.error && (
            <p className="text-xs text-muted-foreground/80 leading-relaxed">
              {preview.error}
            </p>
          )}
          <button
            onClick={handleStart}
            className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <RefreshCw size={12} />
            Retry
          </button>
        </div>
      </div>
    );
  }

  // ── Idle state: show start button ─────────────────────────────────
  return (
    <div className="flex h-full items-center justify-center text-muted-foreground">
      <div className="text-center max-w-sm">
        <Monitor size={48} className="mx-auto mb-4 opacity-20" />
        <p className="text-base font-medium text-foreground/70">
          Preview not running
        </p>
        <p className="text-sm mt-2 text-muted-foreground/80 leading-relaxed">
          Start the dev server to see a live preview of your workspace.
        </p>
        <button
          onClick={handleStart}
          disabled={starting}
          className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          <Play size={14} />
          Start Preview
        </button>
      </div>
    </div>
  );
}
