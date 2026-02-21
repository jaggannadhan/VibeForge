import { chromium, type Browser } from "playwright";
import { mkdir, stat } from "node:fs/promises";
import type { Breakpoint } from "@vibe-studio/shared";
import { snapshotsDir, screenshotPath } from "../lib/paths.js";

export interface ScreenshotResult {
  breakpointId: string;
  filePath: string;
  sizeBytes: number;
}

export interface CaptureOptions {
  projectId: string;
  runId: string;
  previewUrl: string;
  route: string;
  breakpoints: Breakpoint[];
  onProgress?: (breakpointId: string, index: number, total: number) => void;
  onCaptured?: (breakpointId: string, result: ScreenshotResult | null, error?: string) => void;
}

export class ScreenshotService {
  async capture(options: CaptureOptions): Promise<ScreenshotResult[]> {
    const {
      projectId, runId, previewUrl, route, breakpoints,
      onProgress, onCaptured,
    } = options;

    // Ensure output directory exists
    const outDir = snapshotsDir(projectId, runId);
    await mkdir(outDir, { recursive: true });

    let browser: Browser | null = null;
    try {
      browser = await chromium.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-gpu"],
      });

      const results: ScreenshotResult[] = [];
      const targetUrl = new URL(route, previewUrl).toString();

      for (let i = 0; i < breakpoints.length; i++) {
        const bp = breakpoints[i];
        onProgress?.(bp.breakpointId, i, breakpoints.length);

        const context = await browser.newContext({
          viewport: { width: bp.width, height: bp.height },
          deviceScaleFactor: bp.deviceScaleFactor,
        });
        const page = await context.newPage();

        try {
          await page.goto(targetUrl, {
            waitUntil: "networkidle",
            timeout: 30_000,
          });

          // Wait for layout stability after hydration
          await page.waitForTimeout(500);

          const filePath = screenshotPath(projectId, runId, bp.breakpointId);
          await page.screenshot({
            path: filePath,
            fullPage: false,
            type: "png",
          });

          const fileStat = await stat(filePath);
          const result: ScreenshotResult = {
            breakpointId: bp.breakpointId,
            filePath,
            sizeBytes: fileStat.size,
          };
          results.push(result);
          onCaptured?.(bp.breakpointId, result);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          onCaptured?.(bp.breakpointId, null, message);
        } finally {
          await context.close();
        }
      }

      return results;
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }
}
