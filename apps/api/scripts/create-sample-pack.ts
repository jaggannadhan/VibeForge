/**
 * Creates a valid sample design-pack.zip for testing.
 *
 * Usage: pnpm -C apps/api create-sample-pack
 * Output: apps/api/test-fixtures/design-pack.zip
 */
import { mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import AdmZip from "adm-zip";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = resolve(__dirname, "../test-fixtures");
const OUTPUT_PATH = resolve(OUTPUT_DIR, "design-pack.zip");

// --- manifest.json (matches ManifestSchema) ---
const manifest = {
  schemaVersion: "1.0" as const,
  projectName: "Sample Dashboard",
  targets: [
    {
      targetId: "homepage",
      route: "/",
      entry: { type: "route" as const, fileHint: "app/page.tsx" },
    },
  ],
  breakpoints: [
    {
      breakpointId: "desktop",
      width: 1440,
      height: 900,
    },
  ],
  states: [{ stateId: "default" }],
  runDefaults: {
    targetId: "homepage",
    maxIterations: 3,
    threshold: 0.85,
  },
};

// --- design-ir.json (matches DesignIrSchema) ---
const designIr = {
  schemaVersion: "1.0" as const,
  targets: [
    {
      targetId: "homepage",
      nodes: [
        {
          nodeId: "header-01",
          name: "Header",
          matchImportance: "critical" as const,
          componentMapping: {
            component: "header",
            props: {},
          },
          layoutTargets: {
            bbox: { x: 0, y: 0, w: 1440, h: 64 },
          },
          styleTargets: {
            backgroundColor: "rgb(255, 255, 255)",
          },
          a11yTargets: {
            role: "banner",
          },
        },
      ],
    },
  ],
};

// --- Minimal 1x1 white PNG ---
// PNG file signature + IHDR + IDAT + IEND (1x1 pixel, RGB, white)
const PNG_1x1 = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108020000009001" +
    "2e00000000c4944415478016360f8040000010100009a4e61640000000049454e44ae426082",
  "hex"
);

// --- Build zip ---
const zip = new AdmZip();
zip.addFile("manifest.json", Buffer.from(JSON.stringify(manifest, null, 2)));
zip.addFile("design-ir.json", Buffer.from(JSON.stringify(designIr, null, 2)));
zip.addFile("baselines/homepage/desktop/default.png", PNG_1x1);

mkdirSync(OUTPUT_DIR, { recursive: true });
zip.writeZip(OUTPUT_PATH);

console.log(`Sample design pack written to: ${OUTPUT_PATH}`);
