import type { FastifyInstance } from "fastify";
import type { AgentEvent, ServerWsMessage } from "@vibe-studio/shared";
import type { RunService } from "../services/run-service.js";

export function wsRoutes(runService: RunService) {
  return async function (app: FastifyInstance): Promise<void> {
    app.get(
      "/projects/:projectId/ws",
      { websocket: true },
      (socket, request) => {
        const { projectId } = request.params as { projectId: string };

        function send(msg: ServerWsMessage): void {
          if (socket.readyState === 1) {
            socket.send(JSON.stringify(msg));
          }
        }

        // Forward agentEvent for this project
        const onAgentEvent = (evtProjectId: string, event: AgentEvent) => {
          if (evtProjectId === projectId) {
            send({ type: "agentEvent", event });
          }
        };

        // Forward runStarted for this project
        const onRunStarted = (evtProjectId: string, runId: string) => {
          if (evtProjectId === projectId) {
            send({ type: "runStarted", runId, projectId });
          }
        };

        // Forward runFinished for this project
        const onRunFinished = (
          evtProjectId: string,
          runId: string,
          status: "success" | "error"
        ) => {
          if (evtProjectId === projectId) {
            send({ type: "runFinished", runId, projectId, status });
          }
        };

        runService.on("agentEvent", onAgentEvent);
        runService.on("runStarted", onRunStarted);
        runService.on("runFinished", onRunFinished);

        // Handle incoming messages
        socket.on("message", (raw: Buffer | string) => {
          try {
            const msg = JSON.parse(
              typeof raw === "string" ? raw : raw.toString()
            );
            if (msg.type === "ping") {
              send({ type: "error", message: "pong" });
            }
          } catch {
            // Ignore unparseable messages
          }
        });

        // Clean up on close
        socket.on("close", () => {
          runService.off("agentEvent", onAgentEvent);
          runService.off("runStarted", onRunStarted);
          runService.off("runFinished", onRunFinished);
        });
      }
    );
  };
}
