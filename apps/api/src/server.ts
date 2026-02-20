import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { projectRoutes } from "./routes/projects.js";
import { designPackRoutes } from "./routes/design-packs.js";

const PORT = 3001;
const HOST = "127.0.0.1";

async function main() {
  const app = Fastify({ logger: true });

  // CORS — allow the Next.js dev server
  await app.register(cors, { origin: "http://localhost:3000" });

  // Multipart file uploads — 50 MB limit
  await app.register(multipart, { limits: { fileSize: 50 * 1024 * 1024 } });

  // Health check
  app.get("/api/health", async () => ({ status: "ok" }));

  // Routes (prefixed with /api)
  await app.register(projectRoutes, { prefix: "/api" });
  await app.register(designPackRoutes, { prefix: "/api" });

  await app.listen({ port: PORT, host: HOST });
  console.log(`Vibe Studio API running on http://${HOST}:${PORT}`);
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
