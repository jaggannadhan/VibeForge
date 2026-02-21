import type { FastifyInstance } from "fastify";
import { getProject } from "../services/project-service.js";
import {
  getWorkspaceTree,
  getWorkspaceFileContent,
} from "../services/workspace-service.js";

export async function workspaceRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/projects/:projectId/files — file tree
  app.get<{ Params: { projectId: string } }>(
    "/projects/:projectId/files",
    async (request, reply) => {
      const { projectId } = request.params;

      const project = await getProject(projectId);
      if (!project) {
        return reply.status(404).send({ error: `Project ${projectId} not found` });
      }

      const files = await getWorkspaceTree(projectId);
      return reply.send({ projectId, files });
    }
  );

  // GET /api/projects/:projectId/files/* — file content
  app.get<{ Params: { projectId: string; "*": string } }>(
    "/projects/:projectId/files/*",
    async (request, reply) => {
      const { projectId } = request.params;
      const filePath = request.params["*"];

      if (!filePath) {
        return reply.status(400).send({ error: "File path is required" });
      }

      const project = await getProject(projectId);
      if (!project) {
        return reply.status(404).send({ error: `Project ${projectId} not found` });
      }

      const file = await getWorkspaceFileContent(projectId, filePath);
      if (!file) {
        return reply.status(404).send({ error: `File not found: ${filePath}` });
      }

      return reply.send({
        path: file.path,
        content: file.content,
        language: file.language,
      });
    }
  );
}
