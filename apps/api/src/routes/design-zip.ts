import type { FastifyInstance } from "fastify";
import { mkdir, readdir, readFile, rename, rm, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import AdmZip from "adm-zip";
import { getProject } from "../services/project-service.js";
import { newUploadId } from "../lib/ids.js";
import { uploadsDir, workspaceDesignsDir, workspaceDir } from "../lib/paths.js";
import { detectBreakpoints, generateDesignFiles } from "../services/pack-generator.js";

/** Sanitise a project name for use as a directory name */
function sanitiseDirName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "untitled";
}

/** Remove __MACOSX junk and unwrap single root folder (same as design-pack-service) */
async function cleanExtractedDir(dir: string): Promise<void> {
  const macosDir = join(dir, "__MACOSX");
  if (existsSync(macosDir)) {
    await rm(macosDir, { recursive: true });
  }

  const entries = await readdir(dir, { withFileTypes: true });
  const nonHidden = entries.filter((e) => !e.name.startsWith("."));
  if (nonHidden.length === 1 && nonHidden[0].isDirectory()) {
    const innerDir = join(dir, nonHidden[0].name);
    const innerEntries = await readdir(innerDir);
    for (const name of innerEntries) {
      await rename(join(innerDir, name), join(dir, name));
    }
    await rm(innerDir, { recursive: true });
  }
}

export async function designZipRoutes(app: FastifyInstance): Promise<void> {
  // ── POST /api/projects/:projectId/design-zip — upload images zip ──
  app.post<{ Params: { projectId: string } }>(
    "/projects/:projectId/design-zip",
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

      // Buffer the uploaded file (same proven pattern as design-packs route)
      const chunks: Buffer[] = [];
      for await (const chunk of data.file) {
        chunks.push(chunk as Buffer);
      }
      const zipBuffer = Buffer.concat(chunks);

      const uploadId = newUploadId();
      const extractDir = join(uploadsDir(projectId, uploadId), "extracted");
      await mkdir(extractDir, { recursive: true });

      try {
        // Extract with adm-zip (same library as design-pack-service)
        const zip = new AdmZip(zipBuffer);
        zip.extractAllTo(extractDir, true);
        await cleanExtractedDir(extractDir);

        // Detect breakpoints from images
        const detected = await detectBreakpoints(extractDir);

        return reply.status(200).send({
          uploadId,
          detected,
        });
      } catch (err) {
        // Clean up on failure
        const uploadDirPath = uploadsDir(projectId, uploadId);
        await rm(uploadDirPath, { recursive: true }).catch(() => {});

        const message = err instanceof Error ? err.message : "Unknown error";
        return reply
          .status(500)
          .send({ error: `Failed to process design zip: ${message}` });
      }
    }
  );

  // ── POST /api/projects/:projectId/design-files — generate design files ──
  app.post<{
    Params: { projectId: string };
    Body: { uploadId: string; projectName: string };
  }>(
    "/projects/:projectId/design-files",
    async (request, reply) => {
      const { projectId } = request.params;
      const { uploadId, projectName } = request.body as { uploadId: string; projectName: string };

      if (!uploadId || !projectName) {
        return reply.status(400).send({ error: "uploadId and projectName are required" });
      }

      const project = await getProject(projectId);
      if (!project) {
        return reply.status(404).send({ error: `Project ${projectId} not found` });
      }

      const sourceDir = join(uploadsDir(projectId, uploadId), "extracted");
      if (!existsSync(sourceDir)) {
        return reply.status(404).send({ error: `Upload ${uploadId} not found` });
      }

      const sanitisedName = sanitiseDirName(projectName);
      const outputDir = workspaceDesignsDir(projectId, sanitisedName);
      const designDir = `src/designs/${sanitisedName}`;

      try {
        // Ensure the workspace src/designs directory exists
        await mkdir(join(workspaceDir(projectId), "src", "designs"), { recursive: true });

        const result = await generateDesignFiles(sourceDir, outputDir, projectName);

        // Clean up the upload staging area
        const uploadDirPath = uploadsDir(projectId, uploadId);
        await rm(uploadDirPath, { recursive: true }).catch(() => {});

        return reply.status(201).send({
          success: true,
          designDir,
          defaultRoute: result.route,
          files: ["manifest.json", "design-ir.json", "notes.json"],
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return reply
          .status(500)
          .send({ error: `Failed to generate design files: ${message}` });
      }
    }
  );

  // ── GET /api/projects/:projectId/design-baselines — list baseline images ──
  app.get<{
    Params: { projectId: string };
    Querystring: { designDir: string };
  }>(
    "/projects/:projectId/design-baselines",
    async (request, reply) => {
      const { projectId } = request.params;
      const designDirParam = (request.query as { designDir?: string }).designDir;

      if (!designDirParam) {
        return reply.status(400).send({ error: "designDir query parameter is required" });
      }

      // Validate: no path traversal
      if (designDirParam.includes("..")) {
        return reply.status(400).send({ error: "Invalid designDir" });
      }

      const designRoot = join(workspaceDir(projectId), designDirParam);
      const baselinesRoot = join(designRoot, "baselines");
      if (!existsSync(baselinesRoot)) {
        return reply.send({ baselines: [] });
      }

      // Recursively collect all PNGs under baselines/
      const baselines: string[] = [];
      async function walk(dir: string): Promise<void> {
        const entries = await readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = join(dir, entry.name);
          if (entry.isDirectory()) {
            await walk(fullPath);
          } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".png")) {
            // Return path relative to the design dir: "baselines/targetId/breakpointId/stateId.png"
            const relPath = fullPath.slice(designRoot.length + 1);
            baselines.push(relPath);
          }
        }
      }

      await walk(baselinesRoot);
      return reply.send({ baselines });
    }
  );

  // ── GET /api/projects/:projectId/design-baselines/image/* — serve baseline image ──
  app.get<{
    Params: { projectId: string; "*": string };
    Querystring: { designDir: string };
  }>(
    "/projects/:projectId/design-baselines/image/*",
    async (request, reply) => {
      const { projectId } = request.params;
      const filepath = request.params["*"];
      const designDirParam = (request.query as { designDir?: string }).designDir;

      if (!designDirParam || designDirParam.includes("..")) {
        return reply.status(400).send({ error: "Invalid designDir" });
      }

      if (!filepath || filepath.includes("..") || !filepath.endsWith(".png")) {
        return reply.status(400).send({ error: "Invalid baseline path" });
      }

      const baselinesRoot = join(workspaceDir(projectId), designDirParam, "baselines");
      const filePath = resolve(baselinesRoot, filepath);

      // Ensure resolved path stays under baselines directory
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
