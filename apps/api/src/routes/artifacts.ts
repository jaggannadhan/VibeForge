import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { artifactsDir } from "../lib/paths.js";

export async function artifactRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/projects/:projectId/artifacts/screenshots/:runId/:filename
  app.get<{
    Params: { projectId: string; runId: string; filename: string };
  }>(
    "/projects/:projectId/artifacts/screenshots/:runId/:filename",
    async (request, reply) => {
      const { projectId, runId, filename } = request.params;

      // Validate filename to prevent path traversal
      if (!/^[a-z0-9-]+\.png$/.test(filename)) {
        return reply.status(400).send({ error: "Invalid filename" });
      }

      const filePath = join(
        artifactsDir(projectId),
        "snapshots",
        runId,
        filename
      );

      if (!existsSync(filePath)) {
        return reply.status(404).send({ error: "Screenshot not found" });
      }

      const fileBuffer = await readFile(filePath);
      const fileStat = await stat(filePath);

      return reply
        .header("Content-Type", "image/png")
        .header("Content-Length", fileStat.size)
        .header("Cache-Control", "public, max-age=31536000, immutable")
        .send(fileBuffer);
    }
  );
}
