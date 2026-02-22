"use client";

import { useEffect } from "react";
import { Minimize2 } from "lucide-react";

interface FullscreenPreviewProps {
  previewUrl: string;
  onExit: () => void;
}

export function FullscreenPreview({ previewUrl, onExit }: FullscreenPreviewProps) {
  // ESC key exits fullscreen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onExit();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onExit]);

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Exit button — floating tab on right edge, vertically centered */}
      <div className="absolute top-1/2 right-0 -translate-y-1/2 z-10">
        <button
          onClick={onExit}
          className="flex items-center justify-center rounded-l-md bg-neutral-800 p-2 text-white shadow-lg ring-1 ring-white/20 hover:bg-neutral-700 transition-colors"
          title="Exit fullscreen (Esc)"
        >
          <Minimize2 size={16} />
        </button>
      </div>

      {/* Full-size iframe */}
      <iframe
        src={previewUrl}
        className="h-full w-full border-0"
        title="Fullscreen Preview"
        sandbox="allow-scripts allow-same-origin"
      />
    </div>
  );
}
