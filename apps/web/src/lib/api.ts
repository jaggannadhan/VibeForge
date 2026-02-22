import type {
  GetProjectResponse,
  GetFileTreeResponse,
  GetFileContentResponse,
  StartRunResponse,
  GetRunReportResponse,
  GetIterationsResponse,
  StartHistoricalPreviewResponse,
  GetLatestPreviewResponse,
  GetRunStateResponse,
  RevertToBestResponse,
  GetIterationDecisionResponse,
} from "@vibe-studio/shared";
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api";

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

export async function renameProject(
  projectId: string,
  name: string
): Promise<{ projectId: string; name: string }> {
  const res = await fetch(`${API_URL}/projects/${projectId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(`Failed to rename project: ${res.status}`);
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

// ── Workspace design baselines ──────────────────────────────────────

export async function getDesignBaselines(
  projectId: string,
  designDir: string
): Promise<{ baselines: string[] }> {
  const res = await fetch(
    `${API_URL}/projects/${projectId}/design-baselines?designDir=${encodeURIComponent(designDir)}`
  );
  if (!res.ok) throw new Error(`Failed to get design baselines: ${res.status}`);
  return res.json();
}

export function getDesignBaselineUrl(
  projectId: string,
  designDir: string,
  baselinePath: string
): string {
  // baselinePath is like "baselines/screen-1/desktop/default.png"
  // Strip leading "baselines/" to get the image-specific part
  const stripped = baselinePath.replace(/^baselines\//, "");
  return `${API_URL}/projects/${projectId}/design-baselines/image/${stripped}?designDir=${encodeURIComponent(designDir)}`;
}

// ── Design ZIP upload + design files generation ─────────────────────

export interface DesignZipUploadResponse {
  uploadId: string;
  detected: {
    desktop: { exists: boolean; width?: number; height?: number };
    mobile: { exists: boolean; width?: number; height?: number };
    states: string[];
  };
}

export interface DesignFilesResponse {
  success: boolean;
  designDir: string;
  defaultRoute: string;
  files: string[];
}

export async function uploadDesignZip(
  projectId: string,
  file: File
): Promise<DesignZipUploadResponse> {
  const form = new FormData();
  form.append("file", file);

  const res = await fetch(`${API_URL}/projects/${projectId}/design-zip`, {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Upload failed: ${res.status}`);
  }
  return res.json();
}

export async function createDesignFiles(
  projectId: string,
  uploadId: string,
  projectName: string
): Promise<DesignFilesResponse> {
  const res = await fetch(`${API_URL}/projects/${projectId}/design-files`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uploadId, projectName }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Design file generation failed: ${res.status}`);
  }
  return res.json();
}

// ── Project data ────────────────────────────────────────────────────

export async function getProject(projectId: string): Promise<GetProjectResponse | null> {
  const res = await fetch(`${API_URL}/projects/${projectId}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to get project: ${res.status}`);
  return res.json();
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
  designDir: string
): Promise<StartRunResponse> {
  const res = await fetch(`${API_URL}/projects/${projectId}/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ designDir }),
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

// ── Iterations & Historical Preview ──────────────────────────────────

export async function getIterations(
  projectId: string
): Promise<GetIterationsResponse> {
  const res = await fetch(`${API_URL}/projects/${projectId}/iterations`);
  if (!res.ok) throw new Error(`Failed to get iterations: ${res.status}`);
  return res.json();
}

export async function startHistoricalPreview(
  projectId: string,
  iterationId: number
): Promise<StartHistoricalPreviewResponse> {
  const res = await fetch(
    `${API_URL}/projects/${projectId}/iterations/${iterationId}/preview`,
    { method: "POST" }
  );
  if (!res.ok) throw new Error(`Failed to start historical preview: ${res.status}`);
  return res.json();
}

export async function getHistoricalPreviewStatus(
  projectId: string,
  iterationId: number
): Promise<StartHistoricalPreviewResponse> {
  const res = await fetch(
    `${API_URL}/projects/${projectId}/iterations/${iterationId}/preview`
  );
  if (!res.ok) throw new Error(`Failed to get historical preview status: ${res.status}`);
  return res.json();
}

export async function warmupHistoricalPreview(
  projectId: string,
  iterationId: number,
  route?: string
): Promise<{ ready: boolean; error?: string }> {
  const params = route ? `?route=${encodeURIComponent(route)}` : "";
  const res = await fetch(
    `${API_URL}/projects/${projectId}/iterations/${iterationId}/preview/warmup${params}`,
    { method: "POST" }
  );
  if (!res.ok) throw new Error(`Failed to warmup preview: ${res.status}`);
  return res.json();
}

export async function getLatestPreview(
  projectId: string
): Promise<GetLatestPreviewResponse> {
  const res = await fetch(`${API_URL}/projects/${projectId}/preview/latest`);
  if (!res.ok) throw new Error(`Failed to get latest preview: ${res.status}`);
  return res.json();
}

// ── Run State & Convergence Controls ─────────────────────────────────

export async function getRunState(
  projectId: string
): Promise<GetRunStateResponse> {
  const res = await fetch(`${API_URL}/projects/${projectId}/run-state`);
  if (!res.ok) throw new Error(`Failed to get run state: ${res.status}`);
  return res.json();
}

export async function revertToBest(
  projectId: string
): Promise<RevertToBestResponse> {
  const res = await fetch(`${API_URL}/projects/${projectId}/runs/revert-best`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(`Failed to revert to best: ${res.status}`);
  return res.json();
}

export async function getIterationDecision(
  projectId: string,
  iterationId: number
): Promise<GetIterationDecisionResponse> {
  const res = await fetch(
    `${API_URL}/projects/${projectId}/iterations/${iterationId}/decision`
  );
  if (!res.ok) throw new Error(`Failed to get iteration decision: ${res.status}`);
  return res.json();
}
