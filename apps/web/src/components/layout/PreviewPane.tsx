"use client";

import { useState, useEffect, useCallback, useRef, type KeyboardEvent } from "react";
import { Monitor, Play, Square, RefreshCw, Maximize2, Loader2, Package, Zap, Smartphone, Tablet } from "lucide-react";
import {
  startPreview,
  stopPreview,
  getPreviewStatus,
  type PreviewInfo,
} from "@/lib/api";
import { cn } from "@/lib/utils";

interface PreviewPaneProps {
  projectId: string;
  autoStart?: boolean;
  refreshKey?: number;
  route?: string;
  /** When set, bypass normal polling and render this URL directly in the iframe */
  overridePreviewUrl?: string | null;
  onFullscreen?: () => void;
  onRefreshLatest?: () => void;
}

type ViewportMode = "responsive" | "desktop" | "mobile";

const VIEWPORT_PRESETS: Record<Exclude<ViewportMode, "responsive">, { width: number; height: number; label: string }> = {
  desktop: { width: 1440, height: 900, label: "1440 × 900" },
  mobile: { width: 390, height: 844, label: "390 × 844" },
};

const STATUS_LABELS: Record<PreviewInfo["status"], string> = {
  installing: "Installing dependencies...",
  starting: "Starting dev server...",
  ready: "Ready",
  stopped: "Stopped",
  error: "Error",
};

export function PreviewPane({ projectId, autoStart, refreshKey, route, overridePreviewUrl, onFullscreen, onRefreshLatest }: PreviewPaneProps) {
  const [preview, setPreview] = useState<PreviewInfo>({
    previewUrl: null,
    status: "stopped",
  });
  const [starting, setStarting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevRefreshKey = useRef(refreshKey);
  const autoStartTriggered = useRef(false);

  // Editable URL bar state
  const [editableUrl, setEditableUrl] = useState("");
  const [iframeSrcOverride, setIframeSrcOverride] = useState<string | null>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);

  // Viewport mode state
  const [viewportMode, setViewportMode] = useState<ViewportMode>("responsive");

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
      if (preview.status === "ready" || overridePreviewUrl) {
        // The backend warmup step already ensured the route compiled,
        // but give a small buffer for any remaining HMR propagation
        const timer = setTimeout(handleRefresh, 2000);
        return () => clearTimeout(timer);
      }
    }
  }, [refreshKey, preview.status, overridePreviewUrl, handleRefresh]);

  // Compute the current iframe src
  const computedOverrideSrc = overridePreviewUrl
    ? overridePreviewUrl.replace(/\/$/, "") + (route && route !== "/" ? route : "")
    : null;
  const computedLiveSrc = preview.previewUrl
    ? preview.previewUrl.replace(/\/$/, "") + (route && route !== "/" ? route : "")
    : null;
  const currentDisplayUrl = iframeSrcOverride ?? computedOverrideSrc ?? computedLiveSrc;

  // Sync the editable URL input when the underlying URL changes
  const prevDisplayUrl = useRef<string | null>(null);
  useEffect(() => {
    if (currentDisplayUrl && currentDisplayUrl !== prevDisplayUrl.current) {
      setEditableUrl(currentDisplayUrl);
      setIframeSrcOverride(null);
      prevDisplayUrl.current = currentDisplayUrl;
    }
  }, [currentDisplayUrl]);

  // Handle Enter key in URL bar → navigate iframe
  const handleUrlKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const url = editableUrl.trim();
        if (url) {
          setIframeSrcOverride(url);
          // Also update the actual iframe
          const iframe = document.querySelector<HTMLIFrameElement>(
            "iframe[title='Live Preview']"
          );
          if (iframe) iframe.src = url;
        }
        urlInputRef.current?.blur();
      }
      if (e.key === "Escape") {
        // Revert to current URL
        setEditableUrl(currentDisplayUrl ?? "");
        urlInputRef.current?.blur();
      }
    },
    [editableUrl, currentDisplayUrl]
  );

  // Viewport mode selector (shared between override and live modes)
  const viewportModeSelector = (
    <span className="flex items-center gap-0.5 shrink-0 border-l pl-2 ml-1">
      <button
        onClick={() => setViewportMode("responsive")}
        className={cn(
          "rounded p-1 transition-colors",
          viewportMode === "responsive" ? "bg-accent text-foreground" : "hover:bg-accent text-muted-foreground"
        )}
        title="Responsive"
      >
        <Tablet size={12} />
      </button>
      <button
        onClick={() => setViewportMode("desktop")}
        className={cn(
          "rounded p-1 transition-colors",
          viewportMode === "desktop" ? "bg-accent text-foreground" : "hover:bg-accent text-muted-foreground"
        )}
        title="Desktop (1440×900)"
      >
        <Monitor size={12} />
      </button>
      <button
        onClick={() => setViewportMode("mobile")}
        className={cn(
          "rounded p-1 transition-colors",
          viewportMode === "mobile" ? "bg-accent text-foreground" : "hover:bg-accent text-muted-foreground"
        )}
        title="Mobile (390×844)"
      >
        <Smartphone size={12} />
      </button>
    </span>
  );

  // Iframe renderer with viewport mode support
  const renderIframe = (src: string) => {
    if (viewportMode === "responsive") {
      return (
        <div className="flex-1">
          <iframe
            src={src}
            className="h-full w-full border-0"
            title="Live Preview"
            sandbox="allow-scripts allow-same-origin"
          />
        </div>
      );
    }

    const preset = VIEWPORT_PRESETS[viewportMode];
    return (
      <div className="flex-1 overflow-auto bg-muted/30 flex items-start justify-center p-4">
        <div
          className="shrink-0 border border-border rounded-md overflow-hidden shadow-sm bg-white"
          style={{ width: preset.width, height: preset.height }}
        >
          <iframe
            src={src}
            style={{ width: preset.width, height: preset.height }}
            className="border-0"
            title="Live Preview"
            sandbox="allow-scripts allow-same-origin"
          />
        </div>
      </div>
    );
  };

  // ── Override mode: directly show the override URL ──────────────────
  if (overridePreviewUrl) {
    const overrideSrc = iframeSrcOverride ?? computedOverrideSrc!;
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-2 border-b px-3 py-1.5">
          <span className="flex items-center gap-1.5 text-xs text-amber-600 shrink-0">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            Historical
          </span>
          <input
            ref={urlInputRef}
            type="text"
            value={editableUrl}
            onChange={(e) => setEditableUrl(e.target.value)}
            onKeyDown={handleUrlKeyDown}
            onFocus={(e) => e.target.select()}
            className="flex-1 min-w-0 rounded bg-muted/50 px-2 py-0.5 text-xs text-muted-foreground font-mono border border-transparent focus:border-border focus:bg-background focus:text-foreground outline-none transition-colors"
            spellCheck={false}
          />
          <span className="flex items-center gap-1 shrink-0">
            <button
              onClick={handleRefresh}
              className="rounded p-1 hover:bg-accent transition-colors"
              title="Refresh preview"
            >
              <RefreshCw size={12} className="text-muted-foreground" />
            </button>
            {onRefreshLatest && (
              <button
                onClick={onRefreshLatest}
                className="rounded p-1 hover:bg-accent transition-colors"
                title="Back to latest"
              >
                <Square size={12} className="text-muted-foreground" />
              </button>
            )}
            {onFullscreen && (
              <button
                onClick={onFullscreen}
                className="rounded p-1 hover:bg-accent transition-colors"
                title="Fullscreen"
              >
                <Maximize2 size={12} className="text-muted-foreground" />
              </button>
            )}
          </span>
          {viewportModeSelector}
        </div>
        {renderIframe(overrideSrc)}
      </div>
    );
  }

  // Build the full iframe URL including the target route
  const iframeSrc = iframeSrcOverride ?? computedLiveSrc;

  // ── Ready state: show iframe ──────────────────────────────────────
  if (preview.status === "ready" && iframeSrc) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-2 border-b px-3 py-1.5">
          <span className="flex items-center gap-1.5 text-xs text-green-600 shrink-0">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
            Live
          </span>
          <input
            ref={urlInputRef}
            type="text"
            value={editableUrl}
            onChange={(e) => setEditableUrl(e.target.value)}
            onKeyDown={handleUrlKeyDown}
            onFocus={(e) => e.target.select()}
            className="flex-1 min-w-0 rounded bg-muted/50 px-2 py-0.5 text-xs text-muted-foreground font-mono border border-transparent focus:border-border focus:bg-background focus:text-foreground outline-none transition-colors"
            spellCheck={false}
          />
          <span className="flex items-center gap-1 shrink-0">
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
            {onFullscreen && (
              <button
                onClick={onFullscreen}
                className="rounded p-1 hover:bg-accent transition-colors"
                title="Fullscreen"
              >
                <Maximize2 size={12} className="text-muted-foreground" />
              </button>
            )}
          </span>
          {viewportModeSelector}
        </div>
        {renderIframe(iframeSrc)}
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
