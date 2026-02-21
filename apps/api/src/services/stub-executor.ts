import { EventEmitter } from "node:events";
import type { AgentEvent } from "@vibe-studio/shared";
import type { Executor, ExecutorOptions } from "./executor.js";

/**
 * StubExecutor simulates a single-iteration vibe-loop run by emitting
 * AgentEvents on timers. Used until a real AI executor is implemented.
 */
export class StubExecutor extends EventEmitter implements Executor {
  private timers: ReturnType<typeof setTimeout>[] = [];
  private stopped = false;

  start(options: ExecutorOptions): void {
    const { projectId, packId, runId } = options;
    this.stopped = false;

    const rootId = "root";
    const codeGenId = "root-codegen";
    const screenshotId = "root-screenshot";
    const scoringId = "root-scoring";

    const events: Array<{ delayMs: number; event: AgentEvent }> = [
      // Root node created
      {
        delayMs: 0,
        event: makeEvent(projectId, packId, rootId, "nodeCreated", {
          stepKey: "run",
          title: `Run ${runId.slice(0, 8)}`,
          status: "running",
        }),
      },
      {
        delayMs: 100,
        event: makeEvent(projectId, packId, rootId, "nodeStarted", {
          stepKey: "run",
          title: `Run ${runId.slice(0, 8)}`,
          status: "running",
        }),
      },

      // Code Generation step
      {
        delayMs: 500,
        event: makeEvent(projectId, packId, codeGenId, "nodeCreated", {
          stepKey: "codeGen",
          title: "Code Generation",
          status: "queued",
        }),
      },
      {
        delayMs: 800,
        event: makeEvent(projectId, packId, codeGenId, "nodeStarted", {
          stepKey: "codeGen",
          title: "Code Generation",
          status: "running",
        }),
      },
      {
        delayMs: 1500,
        event: makeEvent(projectId, packId, codeGenId, "nodeProgress", {
          message: "Generating component structure...",
          progressPct: 30,
        }),
      },
      {
        delayMs: 2500,
        event: makeEvent(projectId, packId, codeGenId, "nodeProgress", {
          message: "Writing styles and layout...",
          progressPct: 70,
        }),
      },
      {
        delayMs: 3500,
        event: makeEvent(projectId, packId, codeGenId, "nodeFinished", {
          status: "success",
          message: "Generated 3 components",
        }),
      },

      // Screenshot step
      {
        delayMs: 4000,
        event: makeEvent(projectId, packId, screenshotId, "nodeCreated", {
          stepKey: "screenshot",
          title: "Screenshot Capture",
          status: "queued",
        }),
      },
      {
        delayMs: 4200,
        event: makeEvent(projectId, packId, screenshotId, "nodeStarted", {
          stepKey: "screenshot",
          title: "Screenshot Capture",
          status: "running",
        }),
      },
      {
        delayMs: 5000,
        event: makeEvent(projectId, packId, screenshotId, "nodeProgress", {
          message: "Capturing viewport at 1280×800...",
          progressPct: 50,
        }),
      },
      {
        delayMs: 6000,
        event: makeEvent(projectId, packId, screenshotId, "nodeFinished", {
          status: "success",
          message: "Screenshot captured",
        }),
      },

      // Scoring step
      {
        delayMs: 6200,
        event: makeEvent(projectId, packId, scoringId, "nodeCreated", {
          stepKey: "scoring",
          title: "Visual Scoring",
          status: "queued",
        }),
      },
      {
        delayMs: 6400,
        event: makeEvent(projectId, packId, scoringId, "nodeStarted", {
          stepKey: "scoring",
          title: "Visual Scoring",
          status: "running",
        }),
      },
      {
        delayMs: 7500,
        event: makeEvent(projectId, packId, scoringId, "nodeFinished", {
          status: "success",
          message: "Score: 0.82",
          score: {
            overall: 0.82,
            layout: 0.85,
            style: 0.78,
            a11y: 0.9,
            perceptual: 0.75,
          },
        }),
      },

      // Root finished
      {
        delayMs: 8000,
        event: makeEvent(projectId, packId, rootId, "nodeFinished", {
          status: "success",
          message: "Run complete — overall score: 0.82",
          score: {
            overall: 0.82,
            layout: 0.85,
            style: 0.78,
            a11y: 0.9,
            perceptual: 0.75,
          },
        }),
      },
    ];

    for (const { delayMs, event } of events) {
      const timer = setTimeout(() => {
        if (this.stopped) return;
        this.emit("agentEvent", event);
      }, delayMs);
      this.timers.push(timer);
    }

    // Emit done after all events
    const doneTimer = setTimeout(() => {
      if (this.stopped) return;
      this.emit("done", "success");
    }, 8500);
    this.timers.push(doneTimer);
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    for (const timer of this.timers) {
      clearTimeout(timer);
    }
    this.timers = [];
    this.emit("done", "error");
  }
}

let eventCounter = 0;

function makeEvent(
  projectId: string,
  packId: string,
  nodeId: string,
  type: AgentEvent["type"],
  payload: AgentEvent["payload"]
): AgentEvent {
  eventCounter += 1;
  return {
    eventId: `evt-${eventCounter}-${Date.now()}`,
    projectId,
    packId,
    nodeId,
    type,
    ts: new Date().toISOString(),
    payload,
  };
}
