import { existsSync } from "node:fs";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import type { RunService } from "../services/run-service.js";
import { workspaceDir } from "../lib/paths.js";

export function runRoutes(runService: RunService) {
  return async function (app: FastifyInstance): Promise<void> {
    // Start a new run
    app.post<{
      Params: { projectId: string };
      Body: { designDir?: string; packId?: string };
    }>("/projects/:projectId/runs", async (request, reply) => {
      const { projectId } = request.params;
      const { designDir, packId } = request.body;

      if (!designDir && !packId) {
        return reply.status(400).send({ error: "designDir is required" });
      }

      const wsPath = workspaceDir(projectId);

      // If designDir is provided, validate it exists in the workspace
      if (designDir) {
        const absDesignDir = join(wsPath, designDir);
        if (!existsSync(join(absDesignDir, "manifest.json"))) {
          return reply.status(400).send({
            error: `Design directory "${designDir}" does not contain manifest.json`,
          });
        }
      }

      const state = runService.startRun(projectId, designDir || packId!, wsPath);

      return reply.status(201).send({
        runId: state.runId,
        projectId: state.projectId,
        status: state.status,
      });
    });

    // Stop current run
    app.post<{
      Params: { projectId: string };
    }>("/projects/:projectId/runs/stop", async (request, reply) => {
      const { projectId } = request.params;
      runService.stopRun(projectId);
      return reply.status(204).send();
    });

    // Get run report
    app.get<{
      Params: { projectId: string };
    }>("/projects/:projectId/runs/report", async (request, reply) => {
      const { projectId } = request.params;
      const state = runService.getRunState(projectId);

      if (!state) {
        return reply.status(404).send({ error: "No run found for this project" });
      }

      const overallScore = state.tree?.score?.overall;
      const iterationCount = state.tree?.children?.length ?? 0;

      return reply.send({
        runId: state.runId,
        projectId: state.projectId,
        status: state.status,
        tree: state.tree,
        overallScore,
        iterationCount,
      });
    });
  };
}
