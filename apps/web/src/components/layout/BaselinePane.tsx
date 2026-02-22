"use client";

import { useState, useEffect } from "react";
import { Image, ChevronLeft, ChevronRight } from "lucide-react";
import { getDesignBaselines, getDesignBaselineUrl } from "@/lib/api";

interface BaselinePaneProps {
  projectId: string;
  designDir: string | null;
}

interface ParsedBaseline {
  path: string;
  targetId: string;
  breakpointId: string;
  stateId: string;
}

function parseBaselinePaths(paths: string[]): ParsedBaseline[] {
  // paths look like "baselines/screen-1/desktop/default.png"
  return paths
    .map((p) => {
      const parts = p.replace(/^baselines\//, "").replace(/\.png$/, "").split("/");
      if (parts.length !== 3) return null;
      return {
        path: p,
        targetId: parts[0],
        breakpointId: parts[1],
        stateId: parts[2],
      };
    })
    .filter((b): b is ParsedBaseline => b !== null);
}

export function BaselinePane({ projectId, designDir }: BaselinePaneProps) {
  const [baselines, setBaselines] = useState<ParsedBaseline[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!designDir) {
      setBaselines([]);
      return;
    }

    setLoading(true);
    getDesignBaselines(projectId, designDir)
      .then((result) => {
        const parsed = parseBaselinePaths(result.baselines);
        setBaselines(parsed);
        setSelectedIndex(0);
      })
      .catch(() => {
        setBaselines([]);
      })
      .finally(() => setLoading(false));
  }, [projectId, designDir]);

  // No design directory set
  if (!designDir) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <div className="text-center max-w-sm">
          <Image size={48} className="mx-auto mb-4 opacity-20" />
          <p className="text-base font-medium text-foreground/70">
            No baseline images
          </p>
          <p className="text-sm mt-2 text-muted-foreground/80 leading-relaxed">
            Create a new project to see baseline reference images.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <p className="text-sm">Loading baselines...</p>
      </div>
    );
  }

  if (baselines.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <div className="text-center max-w-sm">
          <Image size={48} className="mx-auto mb-4 opacity-20" />
          <p className="text-base font-medium text-foreground/70">
            No baseline images found
          </p>
          <p className="text-sm mt-2 text-muted-foreground/80 leading-relaxed">
            The design directory does not contain baseline images.
          </p>
        </div>
      </div>
    );
  }

  const selected = baselines[selectedIndex];
  const imageUrl = getDesignBaselineUrl(projectId, designDir, selected.path);

  const handlePrev = () => {
    setSelectedIndex((i) => (i > 0 ? i - 1 : baselines.length - 1));
  };

  const handleNext = () => {
    setSelectedIndex((i) => (i < baselines.length - 1 ? i + 1 : 0));
  };

  return (
    <div className="flex h-full flex-col">
      {/* Carousel header with navigation */}
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-xs text-muted-foreground truncate">
          {selected.breakpointId} / {selected.stateId}
        </span>
        {baselines.length > 1 && (
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrev}
              className="rounded p-1 hover:bg-accent transition-colors"
              title="Previous image"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="text-xs tabular-nums text-muted-foreground">
              {selectedIndex + 1} / {baselines.length}
            </span>
            <button
              onClick={handleNext}
              className="rounded p-1 hover:bg-accent transition-colors"
              title="Next image"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Baseline image */}
      <div className="flex flex-1 items-center justify-center overflow-auto bg-muted/30 p-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt={`Baseline: ${selected.breakpointId} / ${selected.stateId}`}
          className="max-h-full max-w-full object-contain rounded shadow-sm"
        />
      </div>

      {/* Thumbnail strip for multiple baselines */}
      {baselines.length > 1 && (
        <div className="flex items-center gap-2 overflow-x-auto border-t px-3 py-2">
          {baselines.map((b, i) => {
            const thumbUrl = getDesignBaselineUrl(projectId, designDir, b.path);
            return (
              <button
                key={b.path}
                onClick={() => setSelectedIndex(i)}
                className={`flex-shrink-0 rounded border-2 transition-colors ${
                  i === selectedIndex
                    ? "border-primary"
                    : "border-transparent hover:border-muted-foreground/30"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={thumbUrl}
                  alt={`${b.breakpointId} / ${b.stateId}`}
                  className="h-12 w-auto rounded object-contain"
                />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
