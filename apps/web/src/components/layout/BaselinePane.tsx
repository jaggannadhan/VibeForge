"use client";

import { useState, useEffect } from "react";
import { Image, ChevronDown } from "lucide-react";
import { getDesignPack, getBaselineUrl } from "@/lib/api";

interface BaselinePaneProps {
  projectId: string;
  packId: string | null;
}

interface ParsedBaseline {
  path: string;
  targetId: string;
  breakpointId: string;
  stateId: string;
}

function parseBaselinePaths(paths: string[]): ParsedBaseline[] {
  // paths look like "baselines/dashboard/desktop/default.png"
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

export function BaselinePane({ projectId, packId }: BaselinePaneProps) {
  const [baselines, setBaselines] = useState<ParsedBaseline[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!packId) {
      setBaselines([]);
      return;
    }

    setLoading(true);
    getDesignPack(projectId, packId)
      .then((pack) => {
        const parsed = parseBaselinePaths(pack.baselineImages);
        setBaselines(parsed);
        setSelectedIndex(0);
      })
      .catch(() => {
        setBaselines([]);
      })
      .finally(() => setLoading(false));
  }, [projectId, packId]);

  // No pack uploaded
  if (!packId) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <div className="text-center max-w-sm">
          <Image size={48} className="mx-auto mb-4 opacity-20" />
          <p className="text-base font-medium text-foreground/70">
            No baseline images
          </p>
          <p className="text-sm mt-2 text-muted-foreground/80 leading-relaxed">
            Upload a design pack to see baseline reference images.
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
            The design pack does not contain baseline images in the expected format.
          </p>
        </div>
      </div>
    );
  }

  const selected = baselines[selectedIndex];
  const imageUrl = getBaselineUrl(projectId, packId, selected.path);

  return (
    <div className="flex h-full flex-col">
      {/* Breakpoint selector (if multiple baselines) */}
      {baselines.length > 1 && (
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <span className="text-xs text-muted-foreground">Breakpoint:</span>
          <div className="relative">
            <select
              value={selectedIndex}
              onChange={(e) => setSelectedIndex(Number(e.target.value))}
              className="appearance-none rounded border bg-background px-2 py-1 pr-6 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {baselines.map((b, i) => (
                <option key={b.path} value={i}>
                  {b.breakpointId} / {b.stateId}
                </option>
              ))}
            </select>
            <ChevronDown
              size={12}
              className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
          </div>
        </div>
      )}

      {/* Baseline image */}
      <div className="flex flex-1 items-center justify-center overflow-auto bg-muted/30 p-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt={`Baseline: ${selected.breakpointId} / ${selected.stateId}`}
          className="max-h-full max-w-full object-contain rounded shadow-sm"
        />
      </div>
    </div>
  );
}
