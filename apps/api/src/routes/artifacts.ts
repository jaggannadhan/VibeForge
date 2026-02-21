import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { FastifyInstance } from "fastify";
import { artifactsDir, designPackDir } from "../lib/paths.js";

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

  // GET /api/projects/:projectId/design-packs/:packId/baselines/*
  app.get<{
    Params: { projectId: string; packId: string; "*": string };
  }>(
    "/projects/:projectId/design-packs/:packId/baselines/*",
    async (request, reply) => {
      const { projectId, packId } = request.params;
      const filepath = request.params["*"];

      // Validate: no path traversal, must end with .png
      if (!filepath || filepath.includes("..") || !filepath.endsWith(".png")) {
        return reply.status(400).send({ error: "Invalid baseline path" });
      }

      const baselinesRoot = join(designPackDir(projectId, packId), "baselines");
      const filePath = resolve(baselinesRoot, filepath);

      // Double-check resolved path is still under baselines directory
      if (!filePath.startsWith(baselinesRoot)) {
        return reply.status(400).send({ error: "Invalid baseline path" });
      }

      if (!existsSync(filePath)) {
        return reply.status(404).send({ error: "Baseline image not found" });
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
