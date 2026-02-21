import type { FastifyInstance } from "fastify";
import type { SandboxManager } from "@vibe-studio/sandbox-runner";
import { getProject } from "../services/project-service.js";
import { workspaceDir } from "../lib/paths.js";

export function previewRoutes(sandboxManager: SandboxManager) {
  return async function (app: FastifyInstance): Promise<void> {
    // POST /api/projects/:projectId/preview/start
    app.post<{ Params: { projectId: string } }>(
      "/projects/:projectId/preview/start",
      async (request, reply) => {
        const { projectId } = request.params;

        const project = await getProject(projectId);
        if (!project) {
          return reply.status(404).send({ error: `Project ${projectId} not found` });
        }

        const wsDir = workspaceDir(projectId);
        const info = await sandboxManager.startPreview(projectId, wsDir);
        return reply.send(info);
      }
    );

    // POST /api/projects/:projectId/preview/stop
    app.post<{ Params: { projectId: string } }>(
      "/projects/:projectId/preview/stop",
      async (request, reply) => {
        const { projectId } = request.params;

        await sandboxManager.stopPreview(projectId);
        return reply.send({ status: "stopped" });
      }
    );

    // GET /api/projects/:projectId/preview
    app.get<{ Params: { projectId: string } }>(
      "/projects/:projectId/preview",
      async (request, reply) => {
        const { projectId } = request.params;

        const info = sandboxManager.getPreviewStatus(projectId);
        return reply.send(info);
      }
    );
  };
}
