import type { FastifyInstance } from "fastify";
import { newProjectId } from "../lib/ids.js";
import { createProject, getProject } from "../services/project-service.js";

export async function projectRoutes(app: FastifyInstance): Promise<void> {
  // POST /api/projects — create project
  app.post("/projects", async (request, reply) => {
    const body = request.body as { name?: string } | null;
    const name = body?.name || "Untitled Project";
    const projectId = newProjectId();
    const meta = await createProject(projectId, name);

    return reply.status(201).send({
      projectId: meta.projectId,
      name: meta.name,
      createdAt: meta.createdAt,
    });
  });

  // GET /api/projects/:projectId — get project metadata
  app.get<{ Params: { projectId: string } }>(
    "/projects/:projectId",
    async (request, reply) => {
      const { projectId } = request.params;
      const meta = await getProject(projectId);

      if (!meta) {
        return reply.status(404).send({ error: `Project ${projectId} not found` });
      }

      return reply.send({
        projectId: meta.projectId,
        name: meta.name,
        status: meta.status === "created" ? "queued" : meta.status,
        createdAt: meta.createdAt,
        updatedAt: meta.updatedAt,
      });
    }
  );
}
