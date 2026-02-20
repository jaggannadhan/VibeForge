import type {
  GetProjectResponse,
  GetFileTreeResponse,
  GetFileContentResponse,
} from "@vibe-studio/shared";
import { MOCK_FILE_TREE, MOCK_FILE_CONTENTS } from "./mock-data";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ── Real API calls ──────────────────────────────────────────────────

export async function createProject(name: string): Promise<{ projectId: string; name: string; createdAt: string }> {
  const res = await fetch(`${API_URL}/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(`Failed to create project: ${res.status}`);
  return res.json();
}

export async function uploadDesignPack(
  projectId: string,
  file: File
): Promise<{ packId: string; projectId: string; validationErrors?: string[] }> {
  const form = new FormData();
  form.append("file", file);

  const res = await fetch(`${API_URL}/projects/${projectId}/design-packs`, {
    method: "POST",
    body: form,
  });

  const data = await res.json();

  if (res.status === 422) {
    return { packId: data.packId, projectId: data.projectId, validationErrors: data.validationErrors };
  }
  if (!res.ok) throw new Error(data.error || `Upload failed: ${res.status}`);
  return data;
}

export async function getDesignPack(
  projectId: string,
  packId: string
): Promise<{ packId: string; projectId: string; manifestPath: string; irPath: string; baselineImages: string[] }> {
  const res = await fetch(`${API_URL}/projects/${projectId}/design-packs/${packId}`);
  if (!res.ok) throw new Error(`Failed to get design pack: ${res.status}`);
  return res.json();
}

// ── Mock data (until Phase 3+) ─────────────────────────────────────

export async function getProject(projectId: string): Promise<GetProjectResponse> {
  await delay(200);
  return {
    projectId,
    name: "Dashboard App",
    status: "running",
    previewUrl: undefined,
    lastRunSummary: {
      runId: "run-001",
      status: "running",
      overallScore: 0.85,
      iterationCount: 2,
    },
    createdAt: "2026-02-20T10:00:00.000Z",
    updatedAt: "2026-02-20T10:00:22.100Z",
  };
}

export async function getFileTree(projectId: string): Promise<GetFileTreeResponse> {
  await delay(150);
  return {
    projectId,
    files: MOCK_FILE_TREE,
  };
}

export async function getFileContent(
  projectId: string,
  filePath: string
): Promise<GetFileContentResponse> {
  await delay(100);
  const file = MOCK_FILE_CONTENTS[filePath];
  if (!file) {
    return {
      path: filePath,
      content: `// File: ${filePath}\n// Content not available in mock`,
      language: "typescript",
    };
  }
  return {
    path: file.path,
    content: file.content,
    language: file.language,
  };
}
