import { EventEmitter } from "node:events";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import {
  ManifestSchema,
  DesignIrSchema,
} from "@vibe-studio/shared";
import type { AgentEvent } from "@vibe-studio/shared";
import type { Executor, ExecutorOptions, PreviewProvider } from "./executor.js";
import { designPackDir, snapshotsDir } from "../lib/paths.js";
import { buildCodeGenPrompt } from "./prompt-builder.js";
import { parseGeneratedFiles } from "./response-parser.js";
import { ScreenshotService } from "./screenshot-service.js";
import { ScoringService } from "./scoring-service.js";
import { createSnapshot, restoreSnapshot } from "./snapshot-service.js";
import { Scorekeeper } from "./scorekeeper.js";
import { PatchPlanner } from "./patch-planner.js";
import type { PatchPlan } from "./patch-planner.js";
import { LockManager } from "./lock-manager.js";
import { StopConditions } from "./stop-conditions.js";
import { OverflowDetector } from "./overflow-detector.js";

const MODEL = "claude-sonnet-4-20250514";
const MAX_TOKENS = 8192;

export class AiExecutor extends EventEmitter implements Executor {
  private stopped = false;
  private abortController: AbortController | null = null;

  start(options: ExecutorOptions): void {
    // Fire-and-forget async — all results come through events
    this.run(options).catch((err) => {
      // Safety net: should not reach here because run() catches internally
      console.error("[AiExecutor] Unexpected error:", err);
    });
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.abortController?.abort();
    this.emit("done", "error");
  }

  private async run(options: ExecutorOptions): Promise<void> {
    const { projectId, packId, workspacePath, runId } = options;
    this.abortController = new AbortController();

    const rootId = "root";
    let currentIterNodeId = rootId;
    let currentStep: "codeGen" | "screenshot" | "scoring" = "codeGen";

    try {
      // ── Root node ───────────────────────────────────────────────
      this.emitEvent(projectId, packId, rootId, "nodeCreated", {
        stepKey: "run",
        title: `Run ${runId.slice(0, 8)}`,
        status: "running",
      });
      this.emitEvent(projectId, packId, rootId, "nodeStarted", {
        stepKey: "run",
        title: `Run ${runId.slice(0, 8)}`,
        status: "running",
      });

      if (this.stopped) return;

      // ── Read design pack (once, before loop) ──────────────────
      const packDir = designPackDir(projectId, packId);
      const manifestRaw = await readFile(join(packDir, "manifest.json"), "utf-8");
      const irRaw = await readFile(join(packDir, "design-ir.json"), "utf-8");

      const manifest = ManifestSchema.parse(JSON.parse(manifestRaw));
      const designIr = DesignIrSchema.parse(JSON.parse(irRaw));

      const targetId = manifest.runDefaults.targetId;
      const threshold = manifest.runDefaults.threshold;
      const maxIterations = manifest.runDefaults.maxIterations;

      const targetIr = designIr.targets.find((t) => t.targetId === targetId);
      if (!targetIr) throw new Error(`Target "${targetId}" not found in design-ir.json`);

      const manifestTarget = manifest.targets.find((t) => t.targetId === targetId);
      if (!manifestTarget) throw new Error(`Target "${targetId}" not found in manifest.json`);

      // Read workspace context (once)
      const layoutPath = join(workspacePath, "src", "app", "layout.tsx");
      const globalsPath = join(workspacePath, "src", "app", "globals.css");
      let existingLayout = "";
      let existingGlobalsCss = "";
      try { existingLayout = await readFile(layoutPath, "utf-8"); } catch { /* may not exist */ }
      try { existingGlobalsCss = await readFile(globalsPath, "utf-8"); } catch { /* may not exist */ }

      if (this.stopped) return;

      if (!options.previewProvider) {
        throw new Error("No preview provider available — cannot capture screenshots");
      }

      const stateId = manifest.states[0].stateId;
      const baselinesRoot = join(packDir, "baselines");
      const client = new Anthropic();
      const screenshotService = new ScreenshotService();
      const scoringService = new ScoringService();
      const overflowDetector = new OverflowDetector();

      let previousScore: { overall: number; layout: number; style: number; a11y: number; perceptual: number } | null = null;
      let finalScore = { overall: 0, layout: 0, style: 0, a11y: 0, perceptual: 0 };
      const scorekeeper = new Scorekeeper(0.01);
      const patchPlanner = new PatchPlanner();
      const lockManager = new LockManager();
      const stopConditions = new StopConditions({ maxIterations });
      const runStartTime = Date.now();
      let consecutiveRejections = 0;
      const acceptedScoreHistory: number[] = [];
      let currentPatchPlan: PatchPlan | undefined;
      let lastOverflowIssues: { selector: string; nodeId: string | null; overflowPx: number }[] = [];

      // ── Iteration loop ────────────────────────────────────────
      for (let iter = 0; iter < maxIterations; iter++) {
        if (this.stopped) return;

        const iterId = `root-iter${iter}`;
        currentIterNodeId = iterId;

        this.emitEvent(projectId, packId, iterId, "nodeCreated", {
          stepKey: "iteration",
          title: `Iteration ${iter + 1}`,
          status: "running",
        });
        this.emitEvent(projectId, packId, iterId, "nodeStarted", {
          stepKey: "iteration",
          title: `Iteration ${iter + 1}`,
          status: "running",
        });

        // ── Code Generation ───────────────────────────────────
        currentStep = "codeGen";
        const codeGenId = `${iterId}-codegen`;

        this.emitEvent(projectId, packId, codeGenId, "nodeCreated", {
          stepKey: "codeGen",
          title: "Code Generation",
          status: "queued",
        });
        this.emitEvent(projectId, packId, codeGenId, "nodeStarted", {
          stepKey: "codeGen",
          title: "Code Generation",
          status: "running",
        });

        // ── PatchPlanner (iteration > 0) ─────────────────────
        currentPatchPlan = undefined;
        if (iter > 0 && previousScore) {
          const lockedIds = lockManager.getLockedNodeIds();
          const rawPlan = patchPlanner.plan(
            previousScore,
            targetIr.nodes,
            lockedIds
          );
          currentPatchPlan = {
            ...rawPlan,
            lockedNodeIds: Array.from(lockedIds),
          } as PatchPlan & { lockedNodeIds: string[] };

          // Emit focus area to trace
          const lockedMsg = lockedIds.size > 0 ? ` (${lockedIds.size} locked)` : "";
          this.emitEvent(projectId, packId, iterId, "nodeProgress", {
            focusArea: currentPatchPlan.focusArea,
            message: `Focus: ${currentPatchPlan.focusArea} — targeting ${currentPatchPlan.topTargets.length} node(s)${lockedMsg}`,
          });
        }

        this.emitEvent(projectId, packId, codeGenId, "nodeProgress", {
          message: iter > 0 ? "Building prompt with feedback..." : "Building prompt...",
          progressPct: 20,
        });

        // Read previously generated code for feedback (iteration > 0)
        let previousCode: string | undefined;
        if (iter > 0) {
          const pagePath = join(workspacePath, "src", manifestTarget.entry.fileHint);
          try { previousCode = await readFile(pagePath, "utf-8"); } catch { /* may not exist */ }
        }

        const { system, user } = buildCodeGenPrompt({
          projectName: manifest.projectName,
          targetId,
          route: manifestTarget.route,
          fileHint: manifestTarget.entry.fileHint,
          nodes: targetIr.nodes,
          breakpoints: manifest.breakpoints,
          existingLayout,
          existingGlobalsCss,
          iterationIndex: iter,
          previousCode,
          previousScore: previousScore ?? undefined,
          patchPlan: currentPatchPlan,
          overflowIssues: lastOverflowIssues.length > 0 ? lastOverflowIssues : undefined,
        });

        this.emitEvent(projectId, packId, codeGenId, "nodeProgress", {
          message: "Calling Claude API...",
          progressPct: 30,
        });

        if (this.stopped) return;

        const response = await client.messages.create(
          { model: MODEL, max_tokens: MAX_TOKENS, system, messages: [{ role: "user", content: user }] },
          { signal: this.abortController.signal }
        );

        if (this.stopped) return;

        const responseText = response.content
          .filter((block) => block.type === "text")
          .map((block) => (block.type === "text" ? block.text : ""))
          .join("");

        this.emitEvent(projectId, packId, codeGenId, "nodeProgress", {
          message: "Parsing response...",
          progressPct: 80,
        });

        const generatedFiles = parseGeneratedFiles(responseText);

        this.emitEvent(projectId, packId, codeGenId, "nodeProgress", {
          message: `Writing ${generatedFiles.length} files...`,
          progressPct: 90,
        });

        for (const file of generatedFiles) {
          const fullPath = join(workspacePath, file.path);
          await mkdir(dirname(fullPath), { recursive: true });
          await writeFile(fullPath, file.content, "utf-8");
        }

        if (this.stopped) return;

        this.emitEvent(projectId, packId, codeGenId, "nodeFinished", {
          status: "success",
          message: `Generated ${generatedFiles.length} file${generatedFiles.length === 1 ? "" : "s"}`,
        });

        for (const file of generatedFiles) {
          this.emitEvent(projectId, packId, codeGenId, "artifactAdded", {
            artifact: {
              id: `iter${iter}-file-${file.path.replace(/\//g, "-")}`,
              kind: "workspaceFile",
              label: file.path,
              href: file.path,
            },
          });
        }

        // ── Screenshot Capture ────────────────────────────────
        currentStep = "screenshot";
        const screenshotId = `${iterId}-screenshot`;

        this.emitEvent(projectId, packId, screenshotId, "nodeCreated", {
          stepKey: "screenshot",
          title: "Screenshot Capture",
          status: "queued",
        });
        this.emitEvent(projectId, packId, screenshotId, "nodeStarted", {
          stepKey: "screenshot",
          title: "Screenshot Capture",
          status: "running",
        });

        this.emitEvent(projectId, packId, screenshotId, "nodeProgress", {
          message: "Waiting for preview server...",
          progressPct: 10,
        });

        const previewUrl = await this.waitForPreview(
          options.previewProvider,
          projectId,
          workspacePath
        );

        if (this.stopped) return;

        this.emitEvent(projectId, packId, screenshotId, "nodeProgress", {
          message: "Waiting for route to compile...",
          progressPct: 15,
        });

        await this.warmUpRoute(previewUrl, manifestTarget.route);

        if (this.stopped) return;

        this.emitEvent(projectId, packId, screenshotId, "nodeProgress", {
          message: `Launching browser for ${manifest.breakpoints.length} breakpoint(s)...`,
          progressPct: 20,
        });

        for (const bp of manifest.breakpoints) {
          this.emitEvent(projectId, packId, `${screenshotId}-${bp.breakpointId}`, "nodeCreated", {
            stepKey: "capture",
            title: `${bp.breakpointId} (${bp.width}×${bp.height})`,
            status: "queued",
          });
        }

        let capturedCount = 0;
        let failedCount = 0;

        const screenshotResults = await screenshotService.capture({
          projectId,
          runId,
          previewUrl,
          route: manifestTarget.route,
          breakpoints: manifest.breakpoints,
          onProgress: (breakpointId, index, total) => {
            this.emitEvent(projectId, packId, `${screenshotId}-${breakpointId}`, "nodeStarted", {
              stepKey: "capture",
              title: breakpointId,
              status: "running",
            });
            this.emitEvent(projectId, packId, screenshotId, "nodeProgress", {
              message: `Capturing ${breakpointId} (${index + 1}/${total})...`,
              progressPct: 20 + Math.round(((index + 1) / total) * 70),
            });
          },
          onCaptured: (breakpointId, result, error) => {
            const nodeId = `${screenshotId}-${breakpointId}`;
            if (result) {
              capturedCount++;
              this.emitEvent(projectId, packId, nodeId, "nodeFinished", {
                status: "success",
                message: `${(result.sizeBytes / 1024).toFixed(0)} KB`,
              });
              this.emitEvent(projectId, packId, nodeId, "artifactAdded", {
                artifact: {
                  id: `iter${iter}-screenshot-${breakpointId}`,
                  kind: "snapshotImage",
                  label: `${breakpointId}.png`,
                  href: `/api/projects/${projectId}/artifacts/screenshots/${runId}/${breakpointId}.png`,
                  mime: "image/png",
                  sizeBytes: result.sizeBytes,
                },
              });
            } else {
              failedCount++;
              this.emitEvent(projectId, packId, nodeId, "nodeFailed", {
                status: "error",
                message: error || "Capture failed",
              });
            }
          },
        });

        if (this.stopped) return;

        const captureMsg = failedCount > 0
          ? `Captured ${capturedCount}/${capturedCount + failedCount}, ${failedCount} failed`
          : `Captured ${capturedCount} screenshot(s)`;

        this.emitEvent(projectId, packId, screenshotId, "nodeFinished", {
          status: failedCount > 0 && capturedCount === 0 ? "error" : "success",
          message: captureMsg,
        });

        // ── Overflow Detection ─────────────────────────────────
        try {
          const overflowReport = await overflowDetector.detect({
            previewUrl,
            route: manifestTarget.route,
            viewportWidth: manifest.breakpoints[0]?.width ?? 1440,
            viewportHeight: manifest.breakpoints[0]?.height ?? 900,
          });

          const overflowMsg = overflowReport.offenderCount > 0
            ? `${overflowReport.offenderCount} overflow issue(s) found`
            : "No overflow detected";

          this.emitEvent(projectId, packId, `${iterId}-overflow`, "nodeCreated", {
            stepKey: "overflow",
            title: "Overflow Check",
            status: "running",
          });
          this.emitEvent(projectId, packId, `${iterId}-overflow`, "nodeFinished", {
            status: overflowReport.offenderCount > 0 ? "error" : "success",
            message: overflowMsg,
          });

          // Feed overflow issues into the next iteration's prompt
          lastOverflowIssues = overflowReport.offenders.slice(0, 10).map((o) => ({
            selector: o.selector,
            nodeId: o.nodeId,
            overflowPx: o.overflowPx,
          }));

          // Store overflow report as artifact (emit summary in trace)
          if (overflowReport.offenderCount > 0) {
            const reportJson = JSON.stringify(overflowReport, null, 2);
            const reportPath = join(snapshotsDir(projectId, runId), `iter-${iter}-overflow.json`);
            await writeFile(reportPath, reportJson, "utf-8");

            this.emitEvent(projectId, packId, `${iterId}-overflow`, "artifactAdded", {
              artifact: {
                id: `iter${iter}-overflow-report`,
                kind: "overflowReport",
                label: "Overflow Report",
                href: `/api/projects/${projectId}/artifacts/screenshots/${runId}/iter-${iter}-overflow.json`,
                mime: "application/json",
              },
            });
          }
        } catch (overflowErr) {
          console.warn(`[AiExecutor] Overflow detection failed for iter ${iter}:`, overflowErr);
        }

        // ── Visual Scoring ────────────────────────────────────
        currentStep = "scoring";
        const scoringId = `${iterId}-scoring`;

        this.emitEvent(projectId, packId, scoringId, "nodeCreated", {
          stepKey: "scoring",
          title: "Visual Scoring",
          status: "queued",
        });
        this.emitEvent(projectId, packId, scoringId, "nodeStarted", {
          stepKey: "scoring",
          title: "Visual Scoring",
          status: "running",
        });

        if (this.stopped) return;

        const scoringInputs = screenshotResults.map((sr) => ({
          screenshotPath: sr.filePath,
          baselinePath: join(baselinesRoot, targetId, sr.breakpointId, `${stateId}.png`),
          breakpointId: sr.breakpointId,
          irNodes: targetIr.nodes,
          signal: this.abortController!.signal,
        }));

        for (const input of scoringInputs) {
          this.emitEvent(projectId, packId, `${scoringId}-${input.breakpointId}`, "nodeCreated", {
            stepKey: "score",
            title: input.breakpointId,
            status: "queued",
          });
        }

        this.emitEvent(projectId, packId, scoringId, "nodeProgress", {
          message: `Scoring ${scoringInputs.length} breakpoint(s) with Claude Vision...`,
          progressPct: 10,
        });

        let scoredCount = 0;
        const aggregateScore = await scoringService.scoreAll(scoringInputs, (bpScore) => {
          scoredCount++;
          const nodeId = `${scoringId}-${bpScore.breakpointId}`;
          this.emitEvent(projectId, packId, nodeId, "nodeStarted", {
            stepKey: "score",
            title: bpScore.breakpointId,
            status: "running",
          });
          this.emitEvent(projectId, packId, nodeId, "nodeFinished", {
            status: "success",
            message: `Score: ${bpScore.overall}`,
            score: { overall: bpScore.overall, layout: bpScore.layout, style: bpScore.style, a11y: bpScore.a11y, perceptual: bpScore.perceptual },
          });
          this.emitEvent(projectId, packId, scoringId, "nodeProgress", {
            message: `Scored ${scoredCount}/${scoringInputs.length} breakpoint(s)...`,
            progressPct: 10 + Math.round((scoredCount / scoringInputs.length) * 85),
          });
        });

        if (this.stopped) return;

        finalScore = {
          overall: aggregateScore.overall,
          layout: aggregateScore.layout,
          style: aggregateScore.style,
          a11y: aggregateScore.a11y,
          perceptual: aggregateScore.perceptual,
        };

        const delta = previousScore ? finalScore.overall - previousScore.overall : undefined;
        const scoreWithDelta = delta !== undefined
          ? { ...finalScore, deltaFromPrev: Math.round(delta * 100) / 100 }
          : finalScore;

        this.emitEvent(projectId, packId, scoringId, "nodeFinished", {
          status: "success",
          message: `Score: ${finalScore.overall}`,
          score: scoreWithDelta,
        });

        // ── Update freeze locks based on aggregate scores ──────
        lockManager.updateLocksFromAggregate(
          { layout: finalScore.layout, style: finalScore.style },
          targetIr.nodes
        );

        // ── Scorekeeper decision ────────────────────────────────
        const decision = scorekeeper.decide(finalScore.overall, iter);

        // ── Workspace snapshot (internal — used by click-to-focus) ──
        try {
          await createSnapshot(projectId, iter, workspacePath);
        } catch (snapErr) {
          console.warn(`[AiExecutor] Snapshot failed for iter ${iter}:`, snapErr);
        }

        if (decision.accepted) {
          // Accepted — this iteration becomes the new best
          consecutiveRejections = 0;
          acceptedScoreHistory.push(finalScore.overall);
          previousScore = finalScore;

          const thresholdMet = finalScore.overall >= threshold;
          const iterMsg = thresholdMet
            ? `Score ${finalScore.overall} >= ${threshold} — threshold met!`
            : `Score ${finalScore.overall} — accepted (best so far)`;

          this.emitEvent(projectId, packId, iterId, "nodeFinished", {
            status: "success",
            message: iterMsg,
            score: scoreWithDelta,
            decision: { accepted: true, reason: decision.reason },
            isBest: true,
          });

          if (thresholdMet) break;
        } else {
          // Rejected — restore workspace from best snapshot
          consecutiveRejections++;

          const iterMsg = `Score ${finalScore.overall} — rejected (${decision.reason}), reverting to iteration ${decision.bestIterationIndex + 1}`;

          this.emitEvent(projectId, packId, iterId, "nodeFinished", {
            status: "success",
            message: iterMsg,
            score: scoreWithDelta,
            decision: { accepted: false, reason: decision.reason },
          });

          // Restore workspace to best iteration state
          if (decision.bestIterationIndex >= 0) {
            try {
              await restoreSnapshot(projectId, decision.bestIterationIndex, workspacePath);
              console.log(`[AiExecutor] Restored workspace to iteration ${decision.bestIterationIndex}`);
            } catch (restoreErr) {
              console.error(`[AiExecutor] Failed to restore snapshot for iter ${decision.bestIterationIndex}:`, restoreErr);
            }
          }
          // Do NOT update previousScore — keep the best score for feedback
        }

        // ── Stop conditions ───────────────────────────────────
        const stopResult = stopConditions.shouldStop({
          iteration: iter,
          acceptedScoreHistory,
          consecutiveRejections,
          startTime: runStartTime,
        });
        if (stopResult.stop) {
          this.emitEvent(projectId, packId, iterId, "nodeProgress", {
            message: `Stopping: ${stopResult.reason}`,
          });
          break;
        }
      }

      // ── Root finished ───────────────────────────────────────────
      const bestState = scorekeeper.getState();
      const thresholdMet = bestState.bestScore >= threshold;
      const lastStop = stopConditions.shouldStop({
        iteration: maxIterations - 1,
        acceptedScoreHistory,
        consecutiveRejections,
        startTime: runStartTime,
      });
      const stopReason = thresholdMet ? "threshold met" : (lastStop.stop ? lastStop.reason : "max iterations");
      this.emitEvent(projectId, packId, rootId, "nodeFinished", {
        status: "success",
        message: `Run complete — best score: ${bestState.bestScore} (iteration ${bestState.bestIterationIndex + 1}, ${stopReason})`,
        score: { overall: bestState.bestScore, layout: finalScore.layout, style: finalScore.style, a11y: finalScore.a11y, perceptual: finalScore.perceptual },
      });

      this.emit("done", "success");
    } catch (error) {
      if (this.stopped) return;

      const message = error instanceof Error ? error.message : String(error);
      console.error(`[AiExecutor] Error in step "${currentStep}":`, message);
      if (error instanceof Error && error.stack) {
        console.error("[AiExecutor] Stack:", error.stack);
      }

      this.emitEvent(projectId, packId, currentIterNodeId, "nodeFailed", {
        status: "error",
        message,
      });
      this.emitEvent(projectId, packId, rootId, "nodeFailed", {
        status: "error",
        message,
      });

      this.emit("done", "error");
    }
  }

  // ── Preview helpers ──────────────────────────────────────────────

  private async waitForPreview(
    previewProvider: PreviewProvider,
    projectId: string,
    workspacePath: string,
    timeoutMs = 120_000
  ): Promise<string> {
    console.log("[AiExecutor] Calling previewProvider.startPreview...");
    await previewProvider.startPreview(projectId, workspacePath);
    console.log("[AiExecutor] startPreview returned, polling for ready...");

    const start = Date.now();
    let loggedStatus = "";
    while (Date.now() - start < timeoutMs) {
      if (this.stopped) throw new Error("Executor stopped");

      const info = previewProvider.getPreviewStatus(projectId);
      if (info.status !== loggedStatus) {
        console.log(`[AiExecutor] Preview status: ${info.status} (url: ${info.previewUrl})`);
        loggedStatus = info.status;
      }
      if (info.status === "ready" && info.previewUrl) {
        return info.previewUrl;
      }
      if (info.status === "error") {
        throw new Error(
          `Preview failed to start: ${(info as { error?: string }).error || "unknown error"}`
        );
      }
      await delay(1000);
    }

    throw new Error(
      `Preview did not become ready within ${timeoutMs}ms`
    );
  }

  // ── Route warmup ─────────────────────────────────────────────────

  /**
   * Poll the target route until Next.js has compiled it (non-404 response).
   * This is needed when the dev server was already running before code gen
   * wrote new route files — the file watcher may take a moment to detect them.
   */
  private async warmUpRoute(
    previewUrl: string,
    route: string,
    timeoutMs = 30_000
  ): Promise<void> {
    const targetUrl = new URL(route, previewUrl).toString();
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      if (this.stopped) return;

      try {
        const response = await fetch(targetUrl);
        if (response.status !== 404) {
          console.log(`[AiExecutor] Route ${route} is ready (status ${response.status})`);
          return;
        }
      } catch {
        // fetch may fail if server is temporarily unavailable
      }

      await delay(1000);
    }

    console.warn(`[AiExecutor] Route warmup timed out after ${timeoutMs}ms for ${targetUrl}`);
  }

  // ── Event helpers ─────────────────────────────────────────────────

  private eventCounter = 0;

  private emitEvent(
    projectId: string,
    packId: string,
    nodeId: string,
    type: AgentEvent["type"],
    payload: AgentEvent["payload"]
  ): void {
    this.eventCounter += 1;
    const event: AgentEvent = {
      eventId: `evt-${this.eventCounter}-${Date.now()}`,
      projectId,
      packId,
      nodeId,
      type,
      ts: new Date().toISOString(),
      payload,
    };
    this.emit("agentEvent", event);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
