import { execFile } from "node:child_process";
import { mkdir, writeFile, readFile, readdir, rm, cp } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import {
  iterSnapshotsDir,
  snapshotArchivePath,
  snapshotMetaPath,
  runtimeDir,
} from "../lib/paths.js";

const execFileAsync = promisify(execFile);

export interface SnapshotMeta {
  iterationIndex: number;
  createdAt: string;
  archivePath: string;
}

/**
 * Create a tar.gz snapshot of the workspace after an iteration completes.
 * Excludes node_modules, .next, and .git to keep archives small.
 */
export async function createSnapshot(
  projectId: string,
  iterationIndex: number,
  workspacePath: string
): Promise<SnapshotMeta> {
  const archivePath = snapshotArchivePath(projectId, iterationIndex);
  const metaPath = snapshotMetaPath(projectId, iterationIndex);

  await mkdir(dirname(archivePath), { recursive: true });

  await execFileAsync("tar", [
    "czf",
    archivePath,
    "--exclude=node_modules",
    "--exclude=.next",
    "--exclude=.git",
    "-C",
    workspacePath,
    ".",
  ]);

  const meta: SnapshotMeta = {
    iterationIndex,
    createdAt: new Date().toISOString(),
    archivePath,
  };

  await writeFile(metaPath, JSON.stringify(meta, null, 2), "utf-8");

  return meta;
}

/**
 * Extract a snapshot tar.gz into a runtime directory for historical preview.
 * Returns the extracted workspace path.
 */
export async function extractSnapshot(
  projectId: string,
  iterationIndex: number
): Promise<string> {
  const archivePath = snapshotArchivePath(projectId, iterationIndex);
  if (!existsSync(archivePath)) {
    throw new Error(`Snapshot archive not found: iter-${iterationIndex}`);
  }

  const destDir = runtimeDir(projectId, iterationIndex);

  // If already extracted, return existing path
  if (existsSync(destDir)) {
    return destDir;
  }

  await mkdir(destDir, { recursive: true });

  await execFileAsync("tar", ["xzf", archivePath, "-C", destDir]);

  return destDir;
}

/**
 * List all snapshot metadata for a project.
 */
export async function listSnapshots(
  projectId: string
): Promise<SnapshotMeta[]> {
  const dir = iterSnapshotsDir(projectId);
  if (!existsSync(dir)) return [];

  const entries = await readdir(dir);
  const metaFiles = entries.filter(
    (e) => e.startsWith("iter-") && e.endsWith(".json")
  );

  const metas: SnapshotMeta[] = [];
  for (const file of metaFiles) {
    try {
      const raw = await readFile(`${dir}/${file}`, "utf-8");
      metas.push(JSON.parse(raw) as SnapshotMeta);
    } catch {
      // Skip corrupted metadata files
    }
  }

  metas.sort((a, b) => a.iterationIndex - b.iterationIndex);
  return metas;
}

/**
 * Check whether a snapshot exists for a given iteration.
 */
export function hasSnapshot(
  projectId: string,
  iterationIndex: number
): boolean {
  return existsSync(snapshotArchivePath(projectId, iterationIndex));
}

/**
 * Restore a snapshot back into the workspace directory.
 * This "reverts" the workspace to the state captured at the given iteration.
 *
 * Steps:
 * 1. Extract snapshot to runtime dir (idempotent via extractSnapshot)
 * 2. Remove workspace contents except node_modules
 * 3. Copy extracted snapshot contents into workspace
 */
export async function restoreSnapshot(
  projectId: string,
  iterationIndex: number,
  workspacePath: string
): Promise<void> {
  const extractedDir = await extractSnapshot(projectId, iterationIndex);

  // Remove everything in the workspace except node_modules
  const entries = await readdir(workspacePath);
  for (const entry of entries) {
    if (entry === "node_modules") continue;
    await rm(join(workspacePath, entry), { recursive: true, force: true });
  }

  // Copy extracted snapshot contents into the workspace
  const snapshotEntries = await readdir(extractedDir);
  for (const entry of snapshotEntries) {
    if (entry === "node_modules") continue;
    await cp(join(extractedDir, entry), join(workspacePath, entry), {
      recursive: true,
      force: true,
    });
  }
}

/**
 * Clean up runtime directories for a project.
 */
export async function cleanupRuntime(
  projectId: string,
  iterationIndex: number
): Promise<void> {
  const dir = runtimeDir(projectId, iterationIndex);
  if (existsSync(dir)) {
    await rm(dir, { recursive: true });
  }
}
