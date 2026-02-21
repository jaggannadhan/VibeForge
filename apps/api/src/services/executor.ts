import type { EventEmitter } from "node:events";
import type { AgentEvent } from "@vibe-studio/shared";

export interface ExecutorOptions {
  projectId: string;
  packId: string;
  workspacePath: string;
  runId: string;
}

export interface Executor extends EventEmitter {
  start(options: ExecutorOptions): void;
  stop(): void;
  on(event: "agentEvent", listener: (e: AgentEvent) => void): this;
  on(event: "done", listener: (status: "success" | "error") => void): this;
  emit(event: "agentEvent", e: AgentEvent): boolean;
  emit(event: "done", status: "success" | "error"): boolean;
}
