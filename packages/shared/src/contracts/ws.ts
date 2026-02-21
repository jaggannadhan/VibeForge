import type { AgentEvent } from "./events";

export type ServerWsMessage =
  | { type: "agentEvent"; event: AgentEvent }
  | { type: "runStarted"; runId: string; projectId: string }
  | { type: "runFinished"; runId: string; projectId: string; status: "success" | "error" }
  | { type: "error"; message: string };

export type ClientWsMessage =
  | { type: "subscribe"; projectId: string }
  | { type: "ping" };
