import { mkdir, readFile, writeFile, cp } from "node:fs/promises";
import { existsSync } from "node:fs";
import {
  projectDir,
  projectMetaPath,
  workspaceDir,
  artifactsDir,
  templateDir,
} from "../lib/paths.js";

export interface ProjectMeta {
  projectId: string;
  name: string;
  status: "created" | "running" | "success" | "error";
  createdAt: string;
  updatedAt: string;
}

export async function createProject(
  projectId: string,
  name: string
): Promise<ProjectMeta> {
  const dir = projectDir(projectId);
  await mkdir(dir, { recursive: true });
  await mkdir(workspaceDir(projectId), { recursive: true });

  // Create artifact subdirectories
  for (const sub of ["design-packs", "snapshots", "reports", "logs"]) {
    await mkdir(`${artifactsDir(projectId)}/${sub}`, { recursive: true });
  }

  // Copy starter template into workspace
  const tmplSrc = templateDir("nextjs-tailwind-shadcn");
  if (existsSync(tmplSrc)) {
    await cp(tmplSrc, workspaceDir(projectId), { recursive: true });
  }

  const now = new Date().toISOString();
  const meta: ProjectMeta = {
    projectId,
    name,
    status: "created",
    createdAt: now,
    updatedAt: now,
  };

  await writeFile(projectMetaPath(projectId), JSON.stringify(meta, null, 2), "utf-8");
  return meta;
}

export async function getProject(projectId: string): Promise<ProjectMeta | null> {
  const metaPath = projectMetaPath(projectId);
  if (!existsSync(metaPath)) return null;
  const raw = await readFile(metaPath, "utf-8");
  return JSON.parse(raw) as ProjectMeta;
}

export async function updateProject(
  projectId: string,
  updates: Partial<ProjectMeta>
): Promise<ProjectMeta> {
  const meta = await getProject(projectId);
  if (!meta) throw new Error(`Project ${projectId} not found`);

  const updated: ProjectMeta = {
    ...meta,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  await writeFile(projectMetaPath(projectId), JSON.stringify(updated, null, 2), "utf-8");
  return updated;
}
