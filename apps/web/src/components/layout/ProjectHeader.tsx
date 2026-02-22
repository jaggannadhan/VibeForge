"use client";

import { useState, useRef, useCallback } from "react";
import { Plus, Package, Play, Square, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProjectHeaderProps {
  projectId: string;
  projectName?: string;
  canRun?: boolean;
  runActive?: boolean;
  onNewProject?: () => void;
  onRun?: () => void;
  onStop?: () => void;
  onRename?: (name: string) => Promise<void>;
}

export function ProjectHeader({
  projectId,
  projectName = "Untitled Project",
  canRun = false,
  runActive = false,
  onNewProject,
  onRun,
  onStop,
  onRename,
}: ProjectHeaderProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(projectName);
  const [saving, setSaving] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const handleNameClick = useCallback(() => {
    setEditValue(projectName);
    setEditing(true);
    // Focus after React re-renders
    setTimeout(() => nameInputRef.current?.select(), 0);
  }, [projectName]);

  const handleNameBlur = useCallback(async () => {
    setEditing(false);
    const trimmed = editValue.trim();
    if (!trimmed || trimmed === projectName) return;
    setSaving(true);
    try {
      await onRename?.(trimmed);
    } finally {
      setSaving(false);
    }
  }, [editValue, projectName, onRename]);

  const handleNameKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        nameInputRef.current?.blur();
      } else if (e.key === "Escape") {
        setEditValue(projectName);
        setEditing(false);
      }
    },
    [projectName]
  );

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b bg-background px-4">
      {/* Logo / App name */}
      <div className="flex items-center gap-2">
        <Package size={18} className="text-primary" />
        <span className="text-sm font-semibold">Vibe Studio</span>
      </div>

      <div className="mx-2 h-5 w-px bg-border" />

      {/* Project name — click to edit */}
      <div className="flex items-center gap-1.5">
        {editing ? (
          <input
            ref={nameInputRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleNameBlur}
            onKeyDown={handleNameKeyDown}
            className="bg-transparent text-sm text-muted-foreground outline-none border-none p-0 m-0 w-auto min-w-[80px]"
            style={{ width: `${Math.max(editValue.length, 8)}ch` }}
          />
        ) : (
          <span
            onClick={handleNameClick}
            className="text-sm text-muted-foreground cursor-pointer hover:text-foreground transition-colors"
          >
            {projectName}
          </span>
        )}
        {saving && <MoreHorizontal size={14} className="text-muted-foreground animate-pulse" />}
      </div>

      <div className="flex-1" />

      {/* New Project button */}
      <button
        onClick={onNewProject}
        className="inline-flex items-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-accent"
      >
        <Plus size={14} />
        New Project
      </button>

      {/* Run / Stop */}
      {runActive ? (
        <button
          onClick={onStop}
          className="inline-flex items-center gap-1.5 rounded-md bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground shadow-sm transition-colors hover:bg-destructive/90"
        >
          <Square size={14} />
          Stop
        </button>
      ) : (
        <button
          disabled={!canRun}
          onClick={onRun}
          title={!canRun ? "Create design files first" : undefined}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90",
            !canRun && "opacity-50 cursor-not-allowed"
          )}
        >
          <Play size={14} />
          Run
        </button>
      )}
    </header>
  );
}
