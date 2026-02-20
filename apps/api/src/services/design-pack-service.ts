import { mkdir, writeFile, readFile, readdir } from "node:fs/promises";
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
