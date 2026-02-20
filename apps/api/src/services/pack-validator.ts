import { ManifestSchema, DesignIrSchema } from "@vibe-studio/shared";
import type { Manifest, DesignIr } from "@vibe-studio/shared";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export interface ValidationResult {
  valid: boolean;
  manifest?: Manifest;
  designIr?: DesignIr;
  errors: string[];
}

export async function validateDesignPack(
  extractedDir: string
): Promise<ValidationResult> {
  const errors: string[] = [];

  // 1. Validate manifest.json
  const manifestPath = join(extractedDir, "manifest.json");
  let manifest: Manifest | undefined;

  try {
    const raw = await readFile(manifestPath, "utf-8");
    const parsed = JSON.parse(raw);
    const result = ManifestSchema.safeParse(parsed);
    if (!result.success) {
      for (const issue of result.error.issues) {
        errors.push(`manifest.json: ${issue.path.join(".")} — ${issue.message}`);
      }
    } else {
      manifest = result.data;
    }
  } catch {
    errors.push("manifest.json: file not found or invalid JSON");
  }

  // 2. Validate design-ir.json
  const irPath = join(extractedDir, "design-ir.json");
  let designIr: DesignIr | undefined;

  try {
    const raw = await readFile(irPath, "utf-8");
    const parsed = JSON.parse(raw);
    const result = DesignIrSchema.safeParse(parsed);
    if (!result.success) {
      for (const issue of result.error.issues) {
        errors.push(`design-ir.json: ${issue.path.join(".")} — ${issue.message}`);
      }
    } else {
      designIr = result.data;
    }
  } catch {
    errors.push("design-ir.json: file not found or invalid JSON");
  }

  // 3. Verify baseline PNG for every (targetId, breakpointId, stateId) triple
  if (manifest) {
    for (const target of manifest.targets) {
      for (const bp of manifest.breakpoints) {
        for (const state of manifest.states) {
          const pngPath = join(
            extractedDir,
            "baselines",
            target.targetId,
            bp.breakpointId,
            `${state.stateId}.png`
          );
          if (!existsSync(pngPath)) {
            errors.push(
              `Missing baseline image: baselines/${target.targetId}/${bp.breakpointId}/${state.stateId}.png`
            );
          }
        }
      }
    }
  }

  // 4. Cross-validate: IR targetIds must exist in manifest
  if (manifest && designIr) {
    const manifestTargetIds = new Set(manifest.targets.map((t) => t.targetId));
    for (const irTarget of designIr.targets) {
      if (!manifestTargetIds.has(irTarget.targetId)) {
        errors.push(
          `design-ir.json: targetId "${irTarget.targetId}" not found in manifest targets`
        );
      }
    }
  }

  return {
    valid: errors.length === 0,
    manifest,
    designIr,
    errors,
  };
}
