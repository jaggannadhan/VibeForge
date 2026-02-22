/**
 * OverflowDetector — uses Playwright to scan the rendered page for elements
 * with horizontal overflow. Runs after screenshot capture and before scoring.
 *
 * Returns a list of offending elements with their selector, dimensions, and
 * associated data-figma-node-id (if present).
 */

import { chromium, type Browser } from "playwright";

export interface OverflowOffender {
  selector: string;
  nodeId: string | null;
  tagName: string;
  clientWidth: number;
  scrollWidth: number;
  overflowPx: number;
}

export interface OverflowReport {
  totalChecked: number;
  offenderCount: number;
  offenders: OverflowOffender[];
}

export interface OverflowDetectOptions {
  previewUrl: string;
  route: string;
  viewportWidth?: number;
  viewportHeight?: number;
}

export class OverflowDetector {
  async detect(options: OverflowDetectOptions): Promise<OverflowReport> {
    const {
      previewUrl,
      route,
      viewportWidth = 1440,
      viewportHeight = 900,
    } = options;

    let browser: Browser | null = null;
    try {
      browser = await chromium.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-gpu"],
      });

      const context = await browser.newContext({
        viewport: { width: viewportWidth, height: viewportHeight },
        deviceScaleFactor: 1,
      });
      const page = await context.newPage();

      const targetUrl = new URL(route, previewUrl).toString();
      await page.goto(targetUrl, {
        waitUntil: "networkidle",
        timeout: 30_000,
      });

      // Wait for layout stability
      await page.waitForTimeout(500);

      // Scan all elements within the app root for horizontal overflow
      const result = await page.evaluate(() => {
        const TOLERANCE = 2; // px tolerance to ignore sub-pixel rounding
        const offenders: Array<{
          selector: string;
          nodeId: string | null;
          tagName: string;
          clientWidth: number;
          scrollWidth: number;
          overflowPx: number;
        }> = [];

        // Start from body or a known app root
        const root = document.querySelector("#__next") || document.body;
        const allElements = root.querySelectorAll("*");
        let totalChecked = 0;

        for (const el of allElements) {
          if (!(el instanceof HTMLElement)) continue;
          totalChecked++;

          const overflowPx = el.scrollWidth - el.clientWidth;
          if (overflowPx <= TOLERANCE) continue;

          // Skip elements that are intentionally scrollable
          const style = getComputedStyle(el);
          if (
            style.overflowX === "auto" ||
            style.overflowX === "scroll" ||
            style.overflowX === "hidden"
          ) {
            continue;
          }

          // Build a readable selector
          let selector = el.tagName.toLowerCase();
          if (el.id) selector += `#${el.id}`;
          if (el.className && typeof el.className === "string") {
            const cls = el.className.trim().split(/\s+/).slice(0, 3).join(".");
            if (cls) selector += `.${cls}`;
          }

          const nodeId = el.getAttribute("data-figma-node-id") || null;

          offenders.push({
            selector,
            nodeId,
            tagName: el.tagName.toLowerCase(),
            clientWidth: el.clientWidth,
            scrollWidth: el.scrollWidth,
            overflowPx,
          });
        }

        return { totalChecked, offenders };
      });

      await context.close();

      return {
        totalChecked: result.totalChecked,
        offenderCount: result.offenders.length,
        offenders: result.offenders,
      };
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }
}
