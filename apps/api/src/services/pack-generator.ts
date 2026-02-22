/**
 * Auto-generates manifest.json, design-ir.json, and notes.json from an
 * image-only ZIP upload.  Also reorganises extracted images into the
 * canonical baselines/<targetId>/<breakpointId>/<stateId>.png layout.
 */
import { readFile, writeFile, mkdir, readdir, copyFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, basename, extname } from "node:path";

// ── Types ──────────────────────────────────────────────────────────

interface InferredImage {
  breakpointId: string;
  stateId: string;
  width: number;
  height: number;
  deviceScaleFactor: number;
  /** Absolute path to the source PNG in the extracted directory */
  sourcePath: string;
}

export interface GenerationResult {
  generated: true;
  targetId: string;
  route: string;
  breakpoints: { breakpointId: string; width: number; height: number; deviceScaleFactor: number }[];
}

export interface DetectedBreakpoints {
  desktop: { exists: boolean; width: number; height: number } | { exists: false };
  mobile: { exists: boolean; width: number; height: number } | { exists: false };
  states: string[];
}

// ── PNG dimension reader (IHDR chunk, no dependency) ───────────────

export async function readPngDimensions(
  filePath: string
): Promise<{ width: number; height: number }> {
  const fd = await readFile(filePath);
  // PNG signature = 8 bytes, then IHDR length (4) + "IHDR" (4) + width (4) + height (4)
  if (fd.length < 24) throw new Error(`Not a valid PNG: ${filePath}`);
  const sig = fd.subarray(0, 8);
  const PNG_SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!sig.equals(PNG_SIG)) throw new Error(`Invalid PNG signature: ${filePath}`);
  const width = fd.readUInt32BE(16);
  const height = fd.readUInt32BE(20);
  return { width, height };
}

// ── Recursive PNG scanner ──────────────────────────────────────────

async function collectPngs(
  dir: string,
  relativeTo: string
): Promise<{ relPath: string; absPath: string }[]> {
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  const results: { relPath: string; absPath: string }[] = [];

  for (const entry of entries) {
    if (entry.name === "__MACOSX" || entry.name === "pack-meta.json") continue;
    const absPath = join(dir, entry.name);
    const relPath = absPath.slice(relativeTo.length + 1); // relative to packDir
    if (entry.isDirectory()) {
      results.push(...(await collectPngs(absPath, relativeTo)));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".png")) {
      results.push({ relPath, absPath });
    }
  }
  return results;
}

// ── Breakpoint inference ───────────────────────────────────────────

const KNOWN_BREAKPOINTS = new Set(["desktop", "mobile", "tablet"]);
const KNOWN_STATES = new Set([
  "default", "hover", "focus", "disabled", "loading", "empty", "error",
]);

function inferDeviceScaleFactor(breakpointId: string): number {
  return breakpointId === "mobile" ? 2 : 1;
}

/**
 * Determines breakpointId and stateId from a PNG's relative path.
 *
 * Structure A (subdirectories):
 *   desktop/default.png  → { breakpointId: "desktop", stateId: "default" }
 *   mobile/hover.png     → { breakpointId: "mobile",  stateId: "hover" }
 *
 * Structure B (flat filenames):
 *   default.desktop.png  → { breakpointId: "desktop", stateId: "default" }
 *   desktop-default.png  → { breakpointId: "desktop", stateId: "default" }
 *   default.png          → { breakpointId: "desktop", stateId: "default" }
 */
function classifyImage(relPath: string): { breakpointId: string; stateId: string } {
  const parts = relPath.split("/").filter(Boolean);

  // Structure A: breakpointDir/state.png
  if (parts.length >= 2) {
    const dirName = parts[parts.length - 2].toLowerCase();
    const fileName = basename(parts[parts.length - 1], extname(parts[parts.length - 1])).toLowerCase();
    if (KNOWN_BREAKPOINTS.has(dirName)) {
      const stateId = KNOWN_STATES.has(fileName) ? fileName : "default";
      return { breakpointId: dirName, stateId };
    }
  }

  // Structure B: flat file — parse filename
  const fileName = basename(relPath, extname(relPath)).toLowerCase();

  // Pattern: "state.breakpoint" (e.g., default.desktop)
  const dotParts = fileName.split(".");
  if (dotParts.length === 2) {
    const [a, b] = dotParts;
    if (KNOWN_BREAKPOINTS.has(b) && KNOWN_STATES.has(a)) {
      return { breakpointId: b, stateId: a };
    }
    if (KNOWN_BREAKPOINTS.has(a) && KNOWN_STATES.has(b)) {
      return { breakpointId: a, stateId: b };
    }
  }

  // Pattern: "breakpoint-state" or "state-breakpoint" (e.g., desktop-default)
  const dashParts = fileName.split("-");
  if (dashParts.length === 2) {
    const [a, b] = dashParts;
    if (KNOWN_BREAKPOINTS.has(a) && KNOWN_STATES.has(b)) {
      return { breakpointId: a, stateId: b };
    }
    if (KNOWN_BREAKPOINTS.has(b) && KNOWN_STATES.has(a)) {
      return { breakpointId: b, stateId: a };
    }
  }

  // Fallback: single file treated as desktop/default
  return { breakpointId: "desktop", stateId: "default" };
}

async function inferBreakpoints(sourceDir: string): Promise<InferredImage[]> {
  const pngs = await collectPngs(sourceDir, sourceDir);
  // Skip any PNGs already inside a "baselines" directory (shouldn't exist for image-only)
  const filtered = pngs.filter((p) => !p.relPath.startsWith("baselines/"));

  const results: InferredImage[] = [];
  for (const { relPath, absPath } of filtered) {
    const { breakpointId, stateId } = classifyImage(relPath);
    const { width, height } = await readPngDimensions(absPath);
    results.push({
      breakpointId,
      stateId,
      width,
      height,
      deviceScaleFactor: inferDeviceScaleFactor(breakpointId),
      sourcePath: absPath,
    });
  }

  if (results.length === 0) {
    throw new Error("No PNG images found in the uploaded ZIP");
  }

  return results;
}

// ── Detect breakpoints (for upload response) ──────────────────────

export async function detectBreakpoints(sourceDir: string): Promise<DetectedBreakpoints> {
  const images = await inferBreakpoints(sourceDir);

  const desktopImg = images.find((i) => i.breakpointId === "desktop");
  const mobileImg = images.find((i) => i.breakpointId === "mobile");
  const states = [...new Set(images.map((i) => i.stateId))];

  return {
    desktop: desktopImg
      ? { exists: true, width: desktopImg.width, height: desktopImg.height }
      : { exists: false },
    mobile: mobileImg
      ? { exists: true, width: mobileImg.width, height: mobileImg.height }
      : { exists: false },
    states,
  };
}

// ── Core design files generator ───────────────────────────────────
// Reusable: writes manifest.json, design-ir.json, baselines/, notes.json
// into the given outputDir, reading source images from sourceDir.

export async function generateDesignFiles(
  sourceDir: string,
  outputDir: string,
  projectName: string
): Promise<GenerationResult> {
  const images = await inferBreakpoints(sourceDir);

  const TARGET_ID = "screen-1";
  const ROUTE = "/screen-1";
  const FILE_HINT = "app/screen-1/page.tsx";

  // Deduplicate breakpoints (use first image per breakpointId for dimensions)
  const breakpointMap = new Map<
    string,
    { width: number; height: number; deviceScaleFactor: number }
  >();
  for (const img of images) {
    if (!breakpointMap.has(img.breakpointId)) {
      breakpointMap.set(img.breakpointId, {
        width: img.width,
        height: img.height,
        deviceScaleFactor: img.deviceScaleFactor,
      });
    }
  }

  const breakpoints = Array.from(breakpointMap.entries()).map(
    ([breakpointId, dims]) => ({ breakpointId, ...dims })
  );

  // Collect unique states
  const stateIds = [...new Set(images.map((i) => i.stateId))];

  // Ensure output directory exists
  await mkdir(outputDir, { recursive: true });

  // ── Generate manifest.json ────────────────────────────────────
  const manifest = {
    schemaVersion: "1.0" as const,
    projectName,
    targets: [
      {
        targetId: TARGET_ID,
        route: ROUTE,
        entry: { type: "route" as const, fileHint: FILE_HINT },
      },
    ],
    breakpoints: breakpoints.map((bp) => ({
      breakpointId: bp.breakpointId,
      width: bp.width,
      height: bp.height,
      deviceScaleFactor: bp.deviceScaleFactor,
    })),
    states: stateIds.map((s) => ({ stateId: s })),
    runDefaults: {
      targetId: TARGET_ID,
      threshold: 0.9,
      maxIterations: 12,
    },
  };

  await writeFile(
    join(outputDir, "manifest.json"),
    JSON.stringify(manifest, null, 2),
    "utf-8"
  );

  // ── Generate design-ir.json (draft) ───────────────────────────
  // Use desktop breakpoint dimensions (or first available) for bbox
  const primaryBp = breakpointMap.get("desktop") ?? breakpoints[0];
  const vpW = primaryBp.width;
  const vpH = primaryBp.height;

  const designIr = {
    schemaVersion: "1.0" as const,
    targets: [
      {
        targetId: TARGET_ID,
        nodes: [
          {
            nodeId: "app-shell",
            name: "App Shell",
            matchImportance: "critical" as const,
            layoutTargets: {
              bbox: { x: 0, y: 0, w: vpW, h: vpH },
              tolerancePx: { x: 0, y: 0, w: 0, h: 0 },
            },
          },
          {
            nodeId: "content",
            name: "Main Content",
            matchImportance: "critical" as const,
            layoutTargets: {
              bbox: { x: 0, y: 0, w: vpW, h: vpH },
              tolerancePx: {
                x: Math.round(vpW * 0.03),
                y: Math.round(vpH * 0.03),
                w: Math.round(vpW * 0.06),
                h: Math.round(vpH * 0.06),
              },
            },
          },
        ],
      },
    ],
  };

  await writeFile(
    join(outputDir, "design-ir.json"),
    JSON.stringify(designIr, null, 2),
    "utf-8"
  );

  // ── Copy images into baselines/ ────────────────────────────────
  for (const img of images) {
    const destDir = join(outputDir, "baselines", TARGET_ID, img.breakpointId);
    await mkdir(destDir, { recursive: true });
    const destPath = join(destDir, `${img.stateId}.png`);
    await copyFile(img.sourcePath, destPath);
  }

  // ── Write notes.json ───────────────────────────────────────────
  const imageSizes: Record<string, { width: number; height: number }> = {};
  for (const [bpId, dims] of breakpointMap) {
    imageSizes[bpId] = { width: dims.width, height: dims.height };
  }

  await writeFile(
    join(outputDir, "notes.json"),
    JSON.stringify(
      {
        draftGenerated: true,
        generatedAt: new Date().toISOString(),
        inferredBreakpoints: breakpoints,
        imageSizes,
      },
      null,
      2
    ),
    "utf-8"
  );

  return {
    generated: true,
    targetId: TARGET_ID,
    route: ROUTE,
    breakpoints,
  };
}

// ── Legacy wrapper: generate in-place (for design-pack-service) ──

export async function generateDesignPack(
  packDir: string,
  projectName: string
): Promise<GenerationResult> {
  const result = await generateDesignFiles(packDir, packDir, projectName);

  // Clean up original image directories (the ones that aren't baselines/)
  const pngs = await collectPngs(packDir, packDir);
  const filtered = pngs.filter(
    (p) => !p.relPath.startsWith("baselines/") && !p.relPath.startsWith("generated/")
  );
  const breakpointDirs = new Set(
    filtered.map((p) => p.relPath.split("/")[0]).filter((d) => KNOWN_BREAKPOINTS.has(d))
  );
  for (const bpId of breakpointDirs) {
    const bpDir = join(packDir, bpId);
    if (existsSync(bpDir)) {
      await rm(bpDir, { recursive: true });
    }
  }
  // Also remove stray PNGs at root (flat structure uploads)
  const rootEntries = await readdir(packDir, { withFileTypes: true });
  for (const entry of rootEntries) {
    if (
      entry.isFile() &&
      entry.name.toLowerCase().endsWith(".png") &&
      !["manifest.json", "design-ir.json", "pack-meta.json"].includes(entry.name)
    ) {
      await rm(join(packDir, entry.name));
    }
  }

  // Move notes.json into generated/ subdirectory for legacy compat
  const notesPath = join(packDir, "notes.json");
  if (existsSync(notesPath)) {
    const generatedDir = join(packDir, "generated");
    await mkdir(generatedDir, { recursive: true });
    const notesContent = await readFile(notesPath, "utf-8");
    await writeFile(join(generatedDir, "notes.json"), notesContent, "utf-8");
    await rm(notesPath);
  }

  return result;
}
