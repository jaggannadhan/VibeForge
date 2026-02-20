import type { FastifyInstance } from "fastify";
import { newPackId } from "../lib/ids.js";
import { getProject } from "../services/project-service.js";
import {
  processDesignPack,
  getDesignPackMeta,
} from "../services/design-pack-service.js";

export async function designPackRoutes(app: FastifyInstance): Promise<void> {
  // POST /api/projects/:projectId/design-packs — upload zip
  app.post<{ Params: { projectId: string } }>(
    "/projects/:projectId/design-packs",
    async (request, reply) => {
      const { projectId } = request.params;

      const project = await getProject(projectId);
      if (!project) {
        return reply.status(404).send({ error: `Project ${projectId} not found` });
      }

      const data = await request.file();
      if (!data) {
        return reply.status(400).send({ error: "No file uploaded" });
      }

      // Buffer the uploaded file
      const chunks: Buffer[] = [];
      for await (const chunk of data.file) {
        chunks.push(chunk as Buffer);
      }
      const zipBuffer = Buffer.concat(chunks);

      const packId = newPackId();

      try {
        const { meta, validation } = await processDesignPack(
          projectId,
          packId,
          zipBuffer
        );

        if (!validation.valid) {
          return reply.status(422).send({
            packId,
            projectId,
            validationErrors: validation.errors,
          });
        }

        return reply.status(201).send({
          packId: meta.packId,
          projectId: meta.projectId,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return reply
          .status(500)
          .send({ error: `Failed to process design pack: ${message}` });
      }
    }
  );

  // GET /api/projects/:projectId/design-packs/:packId — get pack metadata
  app.get<{ Params: { projectId: string; packId: string } }>(
    "/projects/:projectId/design-packs/:packId",
    async (request, reply) => {
      const { projectId, packId } = request.params;

      const meta = await getDesignPackMeta(projectId, packId);
      if (!meta) {
        return reply.status(404).send({ error: `Pack ${packId} not found` });
      }

      return reply.send({
        packId: meta.packId,
        projectId: meta.projectId,
        manifestPath: meta.manifestPath,
        irPath: meta.irPath,
        baselineImages: meta.baselineImages,
      });
    }
  );
}
