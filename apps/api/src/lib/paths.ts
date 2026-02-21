import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

// Storage root: <monorepo>/storage
export const STORAGE_ROOT = resolve(__dirname, "../../../..", "storage");

// Templates root: <monorepo>/templates
export const TEMPLATES_ROOT = resolve(__dirname, "../../../..", "templates");

export function templateDir(templateName: string): string {
  return join(TEMPLATES_ROOT, templateName);
}

export function projectDir(projectId: string): string {
  return join(STORAGE_ROOT, "projects", projectId);
}

export function projectMetaPath(projectId: string): string {
  return join(projectDir(projectId), "project.json");
}

export function workspaceDir(projectId: string): string {
  return join(projectDir(projectId), "workspace");
}

export function artifactsDir(projectId: string): string {
  return join(projectDir(projectId), "artifacts");
}

export function designPackDir(projectId: string, packId: string): string {
  return join(artifactsDir(projectId), "design-packs", packId);
}

export function designPackMetaPath(projectId: string, packId: string): string {
  return join(designPackDir(projectId, packId), "pack-meta.json");
}
