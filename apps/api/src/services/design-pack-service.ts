import { mkdir, writeFile, readFile, readdir, rename, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import AdmZip from "adm-zip";
import { designPackDir, designPackMetaPath } from "../lib/paths.js";
import { validateDesignPack } from "./pack-validator.js";
import type { ValidationResult } from "./pack-validator.js";

export interface PackMeta {
  packId: string;
  projectId: string;
  manifestPath: string;
  irPath: string;
  baselineImages: string[];
  uploadedAt: string;
}

export async function processDesignPack(
  projectId: string,
  packId: string,
  zipBuffer: Buffer
): Promise<{ meta: PackMeta; validation: ValidationResult }> {
  const packDir = designPackDir(projectId, packId);
  await mkdir(packDir, { recursive: true });

  // Extract zip
  const zip = new AdmZip(zipBuffer);
  zip.extractAllTo(packDir, true);

  // Remove macOS resource fork junk
  const macosDir = join(packDir, "__MACOSX");
  if (existsSync(macosDir)) {
    await rm(macosDir, { recursive: true });
  }

  // Unwrap single root folder: if the zip contained one directory with
  // the actual files inside it, hoist those files up to packDir.
  await unwrapSingleRootFolder(packDir);

  // Validate
  const validation = await validateDesignPack(packDir);

  // Collect baseline images
  const baselineImages = await collectBaselineImages(packDir);

  const meta: PackMeta = {
    packId,
    projectId,
    manifestPath: `design-packs/${packId}/manifest.json`,
    irPath: `design-packs/${packId}/design-ir.json`,
    baselineImages,
    uploadedAt: new Date().toISOString(),
  };

  // Persist metadata
  await writeFile(
    designPackMetaPath(projectId, packId),
    JSON.stringify(meta, null, 2),
    "utf-8"
  );

  return { meta, validation };
}

/**
 * If the extracted directory contains exactly one subdirectory (and no
 * other files besides pack-meta.json), move its contents up to the parent.
 * This handles zips where macOS Finder wraps everything in a folder.
 */
async function unwrapSingleRootFolder(packDir: string): Promise<void> {
  const entries = await readdir(packDir, { withFileTypes: true });

  // Filter out pack-meta.json (our own file) to find what the zip contained
  const zipEntries = entries.filter((e) => e.name !== "pack-meta.json");

  // Only unwrap if there's exactly one directory and nothing else
  if (zipEntries.length !== 1 || !zipEntries[0].isDirectory()) return;

  const wrapperDir = join(packDir, zipEntries[0].name);
  const innerEntries = await readdir(wrapperDir);

  // Move each item from wrapper into packDir
  for (const name of innerEntries) {
    const src = join(wrapperDir, name);
    const dest = join(packDir, name);
    await rename(src, dest);
  }

  // Remove the now-empty wrapper directory
  await rm(wrapperDir, { recursive: true });
}

async function collectBaselineImages(
  packDir: string,
  subPath = "baselines"
): Promise<string[]> {
  const fullPath = join(packDir, subPath);
  if (!existsSync(fullPath)) return [];

  const entries = await readdir(fullPath, { withFileTypes: true });
  const images: string[] = [];

  for (const entry of entries) {
    const entryPath = join(subPath, entry.name);
    if (entry.isDirectory()) {
      images.push(...(await collectBaselineImages(packDir, entryPath)));
    } else if (entry.isFile() && entry.name.endsWith(".png")) {
      images.push(entryPath);
    }
  }

  return images;
}

export async function getDesignPackMeta(
  projectId: string,
  packId: string
): Promise<PackMeta | null> {
  const metaPath = designPackMetaPath(projectId, packId);
  if (!existsSync(metaPath)) return null;
  const raw = await readFile(metaPath, "utf-8");
  return JSON.parse(raw) as PackMeta;
}
