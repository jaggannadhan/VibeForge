"use client";

import { useState, useRef } from "react";
import { Upload, Package, Play, Square, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProjectHeaderProps {
  projectId: string;
  projectName?: string;
  uploading?: boolean;
  onDesignPackUploaded?: (file: File) => void;
}

export function ProjectHeader({
  projectId,
  projectName = "Untitled Project",
  uploading = false,
  onDesignPackUploaded,
}: ProjectHeaderProps) {
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (file: File) => {
    if (!file.name.endsWith(".zip")) {
      alert("Please upload a .zip file (Design Pack)");
      return;
    }
    onDesignPackUploaded?.(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
    // Reset so the same file can be re-selected
    e.target.value = "";
  };

  return (
    <header
      className={cn(
        "flex h-12 shrink-0 items-center gap-3 border-b bg-background px-4 transition-colors",
        dragOver && "bg-blue-50 border-blue-300"
      )}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      {/* Logo / App name */}
      <div className="flex items-center gap-2">
        <Package size={18} className="text-primary" />
        <span className="text-sm font-semibold">Vibe Studio</span>
      </div>

      <div className="mx-2 h-5 w-px bg-border" />

      {/* Project name */}
      <span className="text-sm text-muted-foreground">{projectName}</span>

      <div className="flex-1" />

      {/* Upload Design Pack button */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".zip"
        className="hidden"
        onChange={handleInputChange}
      />
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-accent",
          uploading && "opacity-50 cursor-not-allowed"
        )}
      >
        {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
        {uploading ? "Uploading..." : "Upload Design Pack"}
      </button>

      {/* Run / Stop (disabled until Phase 8) */}
      <button
        disabled
        className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-sm opacity-50 cursor-not-allowed"
      >
        <Play size={14} />
        Run
      </button>
    </header>
  );
}
