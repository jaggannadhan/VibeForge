import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import websocket from "@fastify/websocket";
import { SandboxManager } from "@vibe-studio/sandbox-runner";
import { projectRoutes } from "./routes/projects.js";
import { designPackRoutes } from "./routes/design-packs.js";
import { workspaceRoutes } from "./routes/workspace.js";
import { previewRoutes } from "./routes/preview.js";
import { runRoutes } from "./routes/runs.js";
import { wsRoutes } from "./routes/ws.js";
import { artifactRoutes } from "./routes/artifacts.js";
import { designZipRoutes } from "./routes/design-zip.js";
import { RunService } from "./services/run-service.js";
import { templateDir } from "./lib/paths.js";

const PORT = 3001;
const HOST = "127.0.0.1";

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(
      "\n\x1b[31m[server] ANTHROPIC_API_KEY is not set.\x1b[0m\n" +
        "  Add it to apps/api/.env and restart the server.\n"
    );
    process.exit(1);
  }

  const app = Fastify({ logger: true });

  // Sandbox manager — singleton for preview lifecycle
  const resolvedTemplateDir = templateDir("nextjs-tailwind-shadcn");
  console.log(`[server] Template dir resolved to: ${resolvedTemplateDir}`);
  const sandboxManager = new SandboxManager({
    templateDir: resolvedTemplateDir,
  });

  // Run service — singleton for run orchestration
  const runService = new RunService({ previewProvider: sandboxManager });

  // CORS — allow the Next.js dev server
  await app.register(cors, { origin: "http://localhost:3000" });

  // Multipart file uploads — 50 MB limit
  await app.register(multipart, { limits: { fileSize: 50 * 1024 * 1024 } });

  // WebSocket support
  await app.register(websocket);

  // Health check
  app.get("/api/health", async () => ({ status: "ok" }));

  // Routes (prefixed with /api)
  await app.register(projectRoutes, { prefix: "/api" });
  await app.register(designPackRoutes, { prefix: "/api" });
  await app.register(workspaceRoutes, { prefix: "/api" });
  await app.register(previewRoutes(sandboxManager, runService), { prefix: "/api" });
  await app.register(runRoutes(runService), { prefix: "/api" });
  await app.register(wsRoutes(runService), { prefix: "/api" });
  await app.register(artifactRoutes, { prefix: "/api" });
  await app.register(designZipRoutes, { prefix: "/api" });

  // Graceful shutdown — stop all preview processes
  const shutdown = async () => {
    console.log("[server] Shutting down, stopping all previews...");
    await sandboxManager.stopAll();
    await app.close();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  await app.listen({ port: PORT, host: HOST });
  console.log(`Vibe Studio API running on http://${HOST}:${PORT}`);
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
