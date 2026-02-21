import { EventEmitter } from "node:events";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import {
  ManifestSchema,
  DesignIrSchema,
} from "@vibe-studio/shared";
import type { AgentEvent } from "@vibe-studio/shared";
import type { Executor, ExecutorOptions } from "./executor.js";
import { designPackDir } from "../lib/paths.js";
import { buildCodeGenPrompt } from "./prompt-builder.js";
import { parseGeneratedFiles } from "./response-parser.js";

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
    const codeGenId = "root-codegen";
    const screenshotId = "root-screenshot";
    const scoringId = "root-scoring";

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

      // ── Code Generation step ────────────────────────────────────
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

      // Read design pack
      this.emitEvent(projectId, packId, codeGenId, "nodeProgress", {
        message: "Reading design pack...",
        progressPct: 10,
      });

      const packDir = designPackDir(projectId, packId);
      const manifestRaw = await readFile(
        join(packDir, "manifest.json"),
        "utf-8"
      );
      const irRaw = await readFile(
        join(packDir, "design-ir.json"),
        "utf-8"
      );

      const manifest = ManifestSchema.parse(JSON.parse(manifestRaw));
      const designIr = DesignIrSchema.parse(JSON.parse(irRaw));

      if (this.stopped) return;

      // Find target
      const targetId = manifest.runDefaults.targetId;
      const targetIr = designIr.targets.find(
        (t) => t.targetId === targetId
      );
      if (!targetIr) {
        throw new Error(
          `Target "${targetId}" not found in design-ir.json`
        );
      }

      const manifestTarget = manifest.targets.find(
        (t) => t.targetId === targetId
      );
      if (!manifestTarget) {
        throw new Error(
          `Target "${targetId}" not found in manifest.json`
        );
      }

      // Read workspace context
      this.emitEvent(projectId, packId, codeGenId, "nodeProgress", {
        message: "Building prompt...",
        progressPct: 20,
      });

      const layoutPath = join(workspacePath, "src", "app", "layout.tsx");
      const globalsPath = join(
        workspacePath,
        "src",
        "app",
        "globals.css"
      );

      let existingLayout = "";
      let existingGlobalsCss = "";
      try {
        existingLayout = await readFile(layoutPath, "utf-8");
      } catch {
        // layout.tsx may not exist yet
      }
      try {
        existingGlobalsCss = await readFile(globalsPath, "utf-8");
      } catch {
        // globals.css may not exist yet
      }

      if (this.stopped) return;

      // Build prompt
      const { system, user } = buildCodeGenPrompt({
        projectName: manifest.projectName,
        targetId,
        route: manifestTarget.route,
        fileHint: manifestTarget.entry.fileHint,
        nodes: targetIr.nodes,
        breakpoints: manifest.breakpoints,
        existingLayout,
        existingGlobalsCss,
      });

      // Call Claude API
      this.emitEvent(projectId, packId, codeGenId, "nodeProgress", {
        message: "Calling Claude API...",
        progressPct: 30,
      });

      const client = new Anthropic();
      const response = await client.messages.create(
        {
          model: MODEL,
          max_tokens: MAX_TOKENS,
          system,
          messages: [{ role: "user", content: user }],
        },
        { signal: this.abortController.signal }
      );

      if (this.stopped) return;

      // Extract text from response
      const responseText = response.content
        .filter((block) => block.type === "text")
        .map((block) => {
          if (block.type === "text") return block.text;
          return "";
        })
        .join("");

      // Parse generated files
      this.emitEvent(projectId, packId, codeGenId, "nodeProgress", {
        message: "Parsing response...",
        progressPct: 80,
      });

      const generatedFiles = parseGeneratedFiles(responseText);

      // Write files to workspace
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

      // Code gen complete
      this.emitEvent(projectId, packId, codeGenId, "nodeFinished", {
        status: "success",
        message: `Generated ${generatedFiles.length} file${generatedFiles.length === 1 ? "" : "s"}`,
      });

      // Emit artifact links for each generated file
      for (const file of generatedFiles) {
        this.emitEvent(projectId, packId, codeGenId, "artifactAdded", {
          artifact: {
            id: `file-${file.path.replace(/\//g, "-")}`,
            kind: "workspaceFile",
            label: file.path,
            href: file.path,
          },
        });
      }

      // ── Screenshot step (stub) ─────────────────────────────────
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

      await delay(500);
      if (this.stopped) return;

      this.emitEvent(projectId, packId, screenshotId, "nodeProgress", {
        message: `Capturing viewport at ${manifest.breakpoints[0]?.width || 1440}x${manifest.breakpoints[0]?.height || 900}...`,
        progressPct: 50,
      });

      await delay(500);
      if (this.stopped) return;

      this.emitEvent(projectId, packId, screenshotId, "nodeFinished", {
        status: "success",
        message: "Screenshot captured (stub)",
      });

      // ── Scoring step (stub) ─────────────────────────────────────
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

      await delay(500);
      if (this.stopped) return;

      const stubScore = {
        overall: 0.82,
        layout: 0.85,
        style: 0.78,
        a11y: 0.9,
        perceptual: 0.75,
      };

      this.emitEvent(projectId, packId, scoringId, "nodeFinished", {
        status: "success",
        message: `Score: ${stubScore.overall} (stub)`,
        score: stubScore,
      });

      // ── Root finished ───────────────────────────────────────────
      this.emitEvent(projectId, packId, rootId, "nodeFinished", {
        status: "success",
        message: `Run complete — score: ${stubScore.overall} (stub scoring)`,
        score: stubScore,
      });

      this.emit("done", "success");
    } catch (error) {
      if (this.stopped) return; // stop() already emitted done

      const message =
        error instanceof Error ? error.message : String(error);
      console.error("[AiExecutor] Error:", message);

      this.emitEvent(projectId, packId, codeGenId, "nodeFailed", {
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
