// packages/shared/src/contracts/api.ts

import type { TraceStatus, IterationNode } from "./events";

// --- File tree ---

export interface FileTreeNode {
  name: string;
  path: string;
  type: "file" | "directory";
  status?: "added" | "modified" | "untracked";
  children?: FileTreeNode[];
}

// --- Projects ---

export interface CreateProjectResponse {
  projectId: string;
  name: string;
  createdAt: string;
}

export interface GetProjectResponse {
  projectId: string;
  name: string;
  status: TraceStatus;
  previewUrl?: string;
  lastRunSummary?: {
    runId: string;
    status: TraceStatus;
    overallScore?: number;
    iterationCount: number;
  };
  createdAt: string;
  updatedAt: string;
}

// --- Design Packs ---

export interface UploadDesignPackResponse {
  packId: string;
  projectId: string;
  validationErrors?: string[];
}

export interface GetDesignPackResponse {
  packId: string;
  projectId: string;
  manifestPath: string;
  irPath: string;
  baselineImages: string[];
}

// --- Files ---

export interface GetFileTreeResponse {
  projectId: string;
  files: FileTreeNode[];
}

export interface GetFileContentResponse {
  path: string;
  content: string;
  language: string;
}

// --- Preview ---

export interface StartPreviewResponse {
  previewUrl: string;
}

// --- Run ---

export interface StartRunRequest {
  packId: string;
  targetId: string;
  threshold?: number;
  maxIterations?: number;
}

export interface StartRunResponse {
  runId: string;
  projectId: string;
  status: TraceStatus;
}

export interface GetRunReportResponse {
  runId: string;
  projectId: string;
  status: TraceStatus;
  tree: IterationNode | null;
  overallScore?: number;
  iterationCount: number;
}
