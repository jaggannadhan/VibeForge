import { EventEmitter } from "node:events";
import { nanoid } from "nanoid";
import type { AgentEvent, IterationNode, TraceStatus } from "@vibe-studio/shared";
import { AiExecutor } from "./ai-executor.js";
import type { Executor, PreviewProvider } from "./executor.js";

export interface RunState {
  runId: string;
  projectId: string;
  packId: string;
  status: TraceStatus;
  tree: IterationNode | null;
  startedAt: string;
}

/**
 * RunService orchestrates runs. It creates an Executor for each run,
 * forwards AgentEvents, and maintains the trace tree.
 *
 * Events emitted:
 *   - "agentEvent" (projectId: string, event: AgentEvent)
 *   - "runStarted" (projectId: string, runId: string)
 *   - "runFinished" (projectId: string, runId: string, status: "success" | "error")
 */
export class RunService extends EventEmitter {
  private runs = new Map<string, RunState & { executor: Executor }>();
  private eventBuffers = new Map<string, AgentEvent[]>();
  private previewProvider: PreviewProvider | undefined;

  constructor(options?: { previewProvider?: PreviewProvider }) {
    super();
    this.previewProvider = options?.previewProvider;
  }

  startRun(
    projectId: string,
    packId: string,
    workspacePath: string
  ): RunState {
    // Stop any existing run for this project
    const existing = this.runs.get(projectId);
    if (existing && (existing.status === "running" || existing.status === "queued")) {
      existing.executor.stop();
      this.runs.delete(projectId);
    }

    const runId = `run_${nanoid(16)}`;
    const executor = new AiExecutor();

    const state: RunState & { executor: Executor } = {
      runId,
      projectId,
      packId,
      status: "running",
      tree: null,
      startedAt: new Date().toISOString(),
      executor,
    };

    this.runs.set(projectId, state);
    this.eventBuffers.set(projectId, []);

    // Wire executor events
    executor.on("agentEvent", (event: AgentEvent) => {
      state.tree = applyEvent(state.tree, event);
      this.eventBuffers.get(projectId)?.push(event);
      this.emit("agentEvent", projectId, event);
    });

    executor.on("done", (doneStatus: "success" | "error") => {
      state.status = doneStatus === "success" ? "success" : "error";
      this.emit("runFinished", projectId, runId, doneStatus);
    });

    // Start the executor
    executor.start({
      projectId,
      packId,
      workspacePath,
      runId,
      previewProvider: this.previewProvider,
    });
    this.emit("runStarted", projectId, runId);

    return toPublicState(state);
  }

  stopRun(projectId: string): void {
    const state = this.runs.get(projectId);
    if (!state) return;
    if (state.status === "running" || state.status === "queued") {
      state.executor.stop();
    }
  }

  getRunState(projectId: string): RunState | null {
    const state = this.runs.get(projectId);
    if (!state) return null;
    return toPublicState(state);
  }

  /** Returns buffered events for a project (for replaying on late WebSocket connects). */
  getBufferedEvents(projectId: string): AgentEvent[] {
    return this.eventBuffers.get(projectId) ?? [];
  }
}

function toPublicState(state: RunState & { executor: Executor }): RunState {
  return {
    runId: state.runId,
    projectId: state.projectId,
    packId: state.packId,
    status: state.status,
    tree: state.tree,
    startedAt: state.startedAt,
  };
}

// ── Tree building (same logic as frontend ws.ts) ─────────────────────

function findNode(
  tree: IterationNode,
  nodeId: string
): IterationNode | undefined {
  if (tree.nodeId === nodeId) return tree;
  if (tree.children) {
    for (const child of tree.children) {
      const found = findNode(child, nodeId);
      if (found) return found;
    }
  }
  return undefined;
}

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

function applyEvent(
  tree: IterationNode | null,
  event: AgentEvent
): IterationNode {
  // If tree doesn't exist yet, create root from the first event
  if (!tree) {
    return {
      nodeId: event.nodeId,
      iterationIndex: 0,
      stepKey: event.payload.stepKey || "run",
      title: event.payload.title || event.nodeId,
      status: event.payload.status || "running",
      startedAt: event.ts,
      children: [],
    };
  }

  const updated = deepClone(tree);
  const node = findNode(updated, event.nodeId);

  if (!node) {
    // Node doesn't exist yet — add as child
    if (event.type === "nodeCreated" || event.type === "nodeStarted") {
      // Find parent: assume root if nodeId has a dash
      const parentId = event.nodeId.includes("-")
        ? event.nodeId.substring(0, event.nodeId.lastIndexOf("-"))
        : "root";
      const parent = findNode(updated, parentId);
      if (parent) {
        if (!parent.children) parent.children = [];
        parent.children.push({
          nodeId: event.nodeId,
          parentNodeId: parentId,
          iterationIndex: parent.iterationIndex,
          stepKey: event.payload.stepKey || "unknown",
          title: event.payload.title || event.nodeId,
          status: event.payload.status || "running",
          startedAt: event.ts,
        });
      }
    }
    return updated;
  }

  switch (event.type) {
    case "nodeStarted":
      node.status = "running";
      node.startedAt = event.ts;
      if (event.payload.title) node.title = event.payload.title;
      break;
    case "nodeProgress":
      node.message = event.payload.message;
      break;
    case "nodeFinished":
      node.status = event.payload.status || "success";
      node.finishedAt = event.ts;
      if (event.payload.message) node.message = event.payload.message;
      if (event.payload.score) node.score = event.payload.score;
      break;
    case "nodeFailed":
      node.status = "error";
      node.finishedAt = event.ts;
      if (event.payload.message) node.message = event.payload.message;
      break;
    case "artifactAdded":
      if (event.payload.artifact) {
        if (!node.artifacts) node.artifacts = [];
        node.artifacts.push(event.payload.artifact);
      }
      break;
  }

  return updated;
}
