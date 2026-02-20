"use client";

import { Monitor, Upload, ArrowRight, RefreshCw } from "lucide-react";

interface PreviewPaneProps {
  projectId: string;
  previewUrl?: string;
}

export function PreviewPane({ projectId, previewUrl }: PreviewPaneProps) {
  if (previewUrl) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <Monitor size={14} className="text-muted-foreground" />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Preview
          </span>
          <span className="ml-auto text-xs text-muted-foreground/60">
            {previewUrl}
          </span>
          <button
            onClick={() => {
              const iframe = document.querySelector<HTMLIFrameElement>("iframe[title='Live Preview']");
              if (iframe) iframe.src = iframe.src;
            }}
            className="rounded p-1 hover:bg-accent transition-colors"
            title="Refresh preview"
          >
            <RefreshCw size={12} className="text-muted-foreground" />
          </button>
        </div>
        <div className="flex-1">
          <iframe
            src={previewUrl}
            className="h-full w-full border-0"
            title="Live Preview"
            sandbox="allow-scripts allow-same-origin"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <Monitor size={14} className="text-muted-foreground" />
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Preview
        </span>
      </div>
      <div className="flex flex-1 items-center justify-center text-muted-foreground">
        <div className="text-center max-w-sm">
          <Monitor size={48} className="mx-auto mb-4 opacity-20" />
          <p className="text-base font-medium text-foreground/70">No preview yet</p>
          <p className="text-sm mt-2 text-muted-foreground/80 leading-relaxed">
            Upload a Design Pack to generate your UI and preview it live.
          </p>

          <div className="mt-6 flex items-center justify-center gap-3 text-xs text-muted-foreground/60">
            <div className="flex flex-col items-center gap-1">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
                <Upload size={14} />
              </div>
              <span>Upload</span>
            </div>
            <ArrowRight size={14} className="opacity-40" />
            <div className="flex flex-col items-center gap-1">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
                <span className="text-sm font-mono">{"{}"}</span>
              </div>
              <span>Generate</span>
            </div>
            <ArrowRight size={14} className="opacity-40" />
            <div className="flex flex-col items-center gap-1">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
                <Monitor size={14} />
              </div>
              <span>Preview</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
