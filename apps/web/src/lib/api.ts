import type {
  GetProjectResponse,
  GetFileTreeResponse,
  GetFileContentResponse,
  StartRunResponse,
  GetRunReportResponse,
} from "@vibe-studio/shared";
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
): Promise<{ packId: string; projectId: string; validationErrors?: string[]; defaultRoute?: string }> {
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

// ── Baseline image URL ──────────────────────────────────────────────

export function getBaselineUrl(
  projectId: string,
  packId: string,
  baselinePath: string
): string {
  // baselinePath is like "baselines/dashboard/desktop/default.png"
  // Strip the leading "baselines/" since the API route already includes it
  const stripped = baselinePath.replace(/^baselines\//, "");
  return `${API_URL}/projects/${projectId}/design-packs/${packId}/baselines/${stripped}`;
}

// ── Mock data (until later phases) ──────────────────────────────────

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

// ── Real file API (Phase 3) ─────────────────────────────────────────

export async function getFileTree(projectId: string): Promise<GetFileTreeResponse> {
  const res = await fetch(`${API_URL}/projects/${projectId}/files`);
  if (!res.ok) throw new Error(`Failed to get file tree: ${res.status}`);
  return res.json();
}

export async function getFileContent(
  projectId: string,
  filePath: string
): Promise<GetFileContentResponse> {
  const res = await fetch(`${API_URL}/projects/${projectId}/files/${filePath}`);
  if (!res.ok) throw new Error(`Failed to get file content: ${res.status}`);
  return res.json();
}

// ── Preview API (Phase 4) ───────────────────────────────────────────

export interface PreviewInfo {
  previewUrl: string | null;
  status: "installing" | "starting" | "ready" | "stopped" | "error";
  error?: string;
}

export async function startPreview(projectId: string): Promise<PreviewInfo> {
  const res = await fetch(`${API_URL}/projects/${projectId}/preview/start`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(`Failed to start preview: ${res.status}`);
  return res.json();
}

export async function stopPreview(projectId: string): Promise<void> {
  const res = await fetch(`${API_URL}/projects/${projectId}/preview/stop`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(`Failed to stop preview: ${res.status}`);
}

export async function getPreviewStatus(projectId: string): Promise<PreviewInfo> {
  const res = await fetch(`${API_URL}/projects/${projectId}/preview`);
  if (!res.ok) throw new Error(`Failed to get preview status: ${res.status}`);
  return res.json();
}

// ── Run API (Phase 5) ────────────────────────────────────────────────

export async function startRun(
  projectId: string,
  packId: string
): Promise<StartRunResponse> {
  const res = await fetch(`${API_URL}/projects/${projectId}/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ packId }),
  });
  if (!res.ok) throw new Error(`Failed to start run: ${res.status}`);
  return res.json();
}

export async function stopRun(projectId: string): Promise<void> {
  const res = await fetch(`${API_URL}/projects/${projectId}/runs/stop`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(`Failed to stop run: ${res.status}`);
}

export async function getRunReport(
  projectId: string
): Promise<GetRunReportResponse> {
  const res = await fetch(`${API_URL}/projects/${projectId}/runs/report`);
  if (!res.ok) throw new Error(`Failed to get run report: ${res.status}`);
  return res.json();
}
