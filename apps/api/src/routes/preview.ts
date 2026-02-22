import type { FastifyInstance } from "fastify";
import type { SandboxManager } from "@vibe-studio/sandbox-runner";
import { getProject } from "../services/project-service.js";
import { workspaceDir } from "../lib/paths.js";
import { extractSnapshot, hasSnapshot, listSnapshots, restoreSnapshot } from "../services/snapshot-service.js";
import type { RunService } from "../services/run-service.js";

export function previewRoutes(
  sandboxManager: SandboxManager,
  runService?: RunService
) {
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

    // GET /api/projects/:projectId/preview/latest
    app.get<{ Params: { projectId: string } }>(
      "/projects/:projectId/preview/latest",
      async (request, reply) => {
        const { projectId } = request.params;

        const info = sandboxManager.getPreviewStatus(projectId);
        return reply.send({
          previewUrl: info.previewUrl,
          status: info.status,
        });
      }
    );

    // GET /api/projects/:projectId/iterations
    app.get<{ Params: { projectId: string } }>(
      "/projects/:projectId/iterations",
      async (request, reply) => {
        const { projectId } = request.params;

        const snapshots = await listSnapshots(projectId);
        const runState = runService?.getRunState(projectId);

        // Build iteration summaries from the trace tree
        const iterations = snapshots.map((snap) => {
          let status: string = "success";
          let score: { overall?: number; layout?: number; style?: number; a11y?: number; perceptual?: number } | undefined;

          // Try to get status/score from the trace tree
          if (runState?.tree?.children) {
            const iterNode = runState.tree.children.find(
              (c) => c.iterationIndex === snap.iterationIndex
            );
            if (iterNode) {
              status = iterNode.status;
              score = iterNode.score
                ? {
                    overall: iterNode.score.overall,
                    layout: iterNode.score.layout,
                    style: iterNode.score.style,
                    a11y: iterNode.score.a11y,
                    perceptual: iterNode.score.perceptual,
                  }
                : undefined;
            }
          }

          return {
            iterationIndex: snap.iterationIndex,
            status,
            hasSnapshot: true,
            score,
          };
        });

        return reply.send({ projectId, iterations });
      }
    );

    // GET /api/projects/:projectId/iterations/:iterationId/preview — poll status
    app.get<{ Params: { projectId: string; iterationId: string } }>(
      "/projects/:projectId/iterations/:iterationId/preview",
      async (request, reply) => {
        const { projectId } = request.params;
        const iterationId = parseInt(request.params.iterationId, 10);

        if (isNaN(iterationId) || iterationId < 0) {
          return reply.status(400).send({ error: "Invalid iterationId" });
        }

        const info = sandboxManager.getHistoricalPreviewStatus(projectId, iterationId);
        return reply.send({
          previewUrl: info.previewUrl,
          status: info.status,
          iterationId,
          ...(info.error ? { error: info.error } : {}),
        });
      }
    );

    // POST /api/projects/:projectId/iterations/:iterationId/preview
    app.post<{ Params: { projectId: string; iterationId: string } }>(
      "/projects/:projectId/iterations/:iterationId/preview",
      async (request, reply) => {
        const { projectId } = request.params;
        const iterationId = parseInt(request.params.iterationId, 10);

        if (isNaN(iterationId) || iterationId < 0) {
          return reply.status(400).send({ error: "Invalid iterationId" });
        }

        if (!hasSnapshot(projectId, iterationId)) {
          return reply.status(404).send({ error: `No snapshot for iteration ${iterationId}` });
        }

        // Extract snapshot to runtime dir (no-op if already extracted)
        const runtimePath = await extractSnapshot(projectId, iterationId);

        // Start or reuse historical preview
        const info = await sandboxManager.startHistoricalPreview(
          projectId,
          iterationId,
          runtimePath
        );

        return reply.send({
          previewUrl: info.previewUrl,
          status: info.status,
          iterationId,
        });
      }
    );

    // GET /api/projects/:projectId/run-state
    app.get<{ Params: { projectId: string } }>(
      "/projects/:projectId/run-state",
      async (request, reply) => {
        const { projectId } = request.params;

        const state = runService?.getRunState(projectId);
        if (!state) {
          return reply.status(404).send({ error: "No run found for this project" });
        }

        // Extract best iteration info from the trace tree
        let bestIterationIndex: number | null = null;
        if (state.tree?.children) {
          for (const child of state.tree.children) {
            if (child.isBest) {
              bestIterationIndex = child.iterationIndex;
            }
          }
        }

        return reply.send({
          runId: state.runId,
          projectId: state.projectId,
          status: state.status,
          bestIterationIndex,
          startedAt: state.startedAt,
        });
      }
    );

    // POST /api/projects/:projectId/runs/revert-best
    app.post<{ Params: { projectId: string } }>(
      "/projects/:projectId/runs/revert-best",
      async (request, reply) => {
        const { projectId } = request.params;

        const state = runService?.getRunState(projectId);
        if (!state) {
          return reply.status(404).send({ error: "No run found for this project" });
        }

        // Find best iteration
        let bestIterationIndex: number | null = null;
        if (state.tree?.children) {
          for (const child of state.tree.children) {
            if (child.isBest) {
              bestIterationIndex = child.iterationIndex;
            }
          }
        }

        if (bestIterationIndex === null) {
          return reply.status(400).send({ error: "No best iteration found" });
        }

        if (!hasSnapshot(projectId, bestIterationIndex)) {
          return reply.status(404).send({ error: `No snapshot for best iteration ${bestIterationIndex}` });
        }

        const wsDir = workspaceDir(projectId);
        await restoreSnapshot(projectId, bestIterationIndex, wsDir);

        // Restart the latest preview
        const info = await sandboxManager.startPreview(projectId, wsDir);

        return reply.send({
          restoredIteration: bestIterationIndex,
          previewUrl: info.previewUrl,
          status: info.status,
        });
      }
    );

    // POST /api/projects/:projectId/iterations/:iterationId/preview/warmup
    // Polls the preview URL until the route compiles (returns non-404).
    // The frontend can't do this due to CORS — opaque responses hide status codes.
    app.post<{
      Params: { projectId: string; iterationId: string };
      Querystring: { route?: string };
    }>(
      "/projects/:projectId/iterations/:iterationId/preview/warmup",
      async (request, reply) => {
        const { projectId } = request.params;
        const iterationId = parseInt(request.params.iterationId, 10);
        const route = (request.query as { route?: string }).route || "/";

        if (isNaN(iterationId) || iterationId < 0) {
          return reply.status(400).send({ error: "Invalid iterationId" });
        }

        const info = sandboxManager.getHistoricalPreviewStatus(projectId, iterationId);
        if (info.status !== "ready" || !info.previewUrl) {
          return reply.send({ ready: false, error: "Preview not ready" });
        }

        const routeSuffix = route && route !== "/" ? route : "";
        const fullUrl = info.previewUrl.replace(/\/$/, "") + routeSuffix;

        const MAX_ATTEMPTS = 30; // 30 × 1s = 30 seconds
        for (let i = 0; i < MAX_ATTEMPTS; i++) {
          try {
            const res = await fetch(fullUrl);
            if (res.status !== 404) {
              // Route is compiled — give Next.js a moment to finish HMR
              await new Promise((r) => setTimeout(r, 1500));
              return reply.send({ ready: true });
            }
          } catch {
            // Server not responding yet
          }
          await new Promise((r) => setTimeout(r, 1000));
        }

        return reply.send({ ready: false, error: "Warmup timed out" });
      }
    );

    // GET /api/projects/:projectId/iterations/:iterationId/decision
    app.get<{ Params: { projectId: string; iterationId: string } }>(
      "/projects/:projectId/iterations/:iterationId/decision",
      async (request, reply) => {
        const { projectId } = request.params;
        const iterationId = parseInt(request.params.iterationId, 10);

        if (isNaN(iterationId) || iterationId < 0) {
          return reply.status(400).send({ error: "Invalid iterationId" });
        }

        const state = runService?.getRunState(projectId);
        if (!state || !state.tree?.children) {
          return reply.status(404).send({ error: "No run data found" });
        }

        const iterNode = state.tree.children.find(
          (c) => c.iterationIndex === iterationId
        );

        if (!iterNode) {
          return reply.status(404).send({ error: `Iteration ${iterationId} not found` });
        }

        return reply.send({
          iterationIndex: iterNode.iterationIndex,
          decision: iterNode.decision ?? null,
          isBest: iterNode.isBest ?? false,
          focusArea: iterNode.focusArea ?? null,
          score: iterNode.score ?? null,
        });
      }
    );
  };
}
