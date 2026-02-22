import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { cp } from "node:fs/promises";
import { createServer } from "node:net";
import { join } from "node:path";

export interface PreviewInfo {
  previewUrl: string | null;
  status: "installing" | "starting" | "ready" | "stopped" | "error";
  error?: string;
}

interface PreviewProcess {
  projectId: string;
  workspacePath: string;
  port: number;
  childProcess: ChildProcess | null;
  status: PreviewInfo["status"];
  previewUrl: string | null;
  startedAt: number;
  lastAccessedAt: number;
  error?: string;
}

const TTL_MS = 30 * 60 * 1000; // 30 minutes
const HISTORICAL_TTL_MS = 10 * 60 * 1000; // 10 minutes for historical previews
const MAX_HISTORICAL_PREVIEWS = 2;
const REAPER_INTERVAL_MS = 60 * 1000; // check every 60s

/** Build a clean env for child processes, stripping tsx preload flags */
function cleanEnv(): Record<string, string> {
  const env = { ...process.env } as Record<string, string>;
  // tsx sets NODE_OPTIONS with --require/--loader pointing to its own modules.
  // Child processes can't resolve those paths, so strip them.
  delete env.NODE_OPTIONS;
  env.NODE_ENV = "development";
  env.PATH = `/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${process.env.HOME}/Library/pnpm:${process.env.PATH || ""}`;
  return env;
}

async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (addr && typeof addr === "object") {
        const port = addr.port;
        server.close(() => resolve(port));
      } else {
        server.close(() => reject(new Error("Could not determine port")));
      }
    });
    server.on("error", reject);
  });
}

export interface SandboxManagerOptions {
  templateDir?: string; // Path to template for self-healing empty workspaces
}

export class SandboxManager {
  private previews = new Map<string, PreviewProcess>();
  private historicalPreviews = new Map<string, PreviewProcess>();
  private reaperInterval: ReturnType<typeof setInterval> | null = null;
  private templateDir: string | null;

  constructor(options?: SandboxManagerOptions) {
    this.templateDir = options?.templateDir ?? null;
    this.reaperInterval = setInterval(() => this.reapIdle(), REAPER_INTERVAL_MS);
  }

  // ── Latest preview (existing API) ──────────────────────────────────

  async startPreview(projectId: string, workspacePath: string): Promise<PreviewInfo> {
    // If already running/starting, return current status
    const existing = this.previews.get(projectId);
    if (existing && existing.status !== "stopped" && existing.status !== "error") {
      existing.lastAccessedAt = Date.now();
      return this.toInfo(existing);
    }

    const port = await findFreePort();
    const now = Date.now();

    const proc: PreviewProcess = {
      projectId,
      workspacePath,
      port,
      childProcess: null,
      status: "installing",
      previewUrl: `http://localhost:${port}`,
      startedAt: now,
      lastAccessedAt: now,
    };

    this.previews.set(projectId, proc);

    // Run install + spawn asynchronously
    this.installAndSpawn(proc).catch((err) => {
      proc.status = "error";
      proc.error = err instanceof Error ? err.message : String(err);
    });

    return this.toInfo(proc);
  }

  getPreviewStatus(projectId: string): PreviewInfo {
    const proc = this.previews.get(projectId);
    if (!proc) {
      return { previewUrl: null, status: "stopped" };
    }
    proc.lastAccessedAt = Date.now();
    return this.toInfo(proc);
  }

  async stopPreview(projectId: string): Promise<void> {
    const proc = this.previews.get(projectId);
    if (!proc) return;

    this.killProcess(proc);
    proc.status = "stopped";
    this.previews.delete(projectId);
  }

  // ── Historical preview ─────────────────────────────────────────────

  private historicalKey(projectId: string, iterationId: number): string {
    return `${projectId}:iter:${iterationId}`;
  }

  async startHistoricalPreview(
    projectId: string,
    iterationId: number,
    workspacePath: string
  ): Promise<PreviewInfo> {
    const key = this.historicalKey(projectId, iterationId);

    // Reuse if already running/starting
    const existing = this.historicalPreviews.get(key);
    if (existing && existing.status !== "stopped" && existing.status !== "error") {
      existing.lastAccessedAt = Date.now();
      return this.toInfo(existing);
    }

    // Enforce LRU limit: evict oldest historical preview if at capacity
    await this.evictHistoricalIfNeeded();

    const port = await findFreePort();
    const now = Date.now();

    const proc: PreviewProcess = {
      projectId,
      workspacePath,
      port,
      childProcess: null,
      status: "installing",
      previewUrl: `http://localhost:${port}`,
      startedAt: now,
      lastAccessedAt: now,
    };

    this.historicalPreviews.set(key, proc);

    // Run install + spawn asynchronously
    this.installAndSpawn(proc).catch((err) => {
      proc.status = "error";
      proc.error = err instanceof Error ? err.message : String(err);
    });

    return this.toInfo(proc);
  }

  getHistoricalPreviewStatus(projectId: string, iterationId: number): PreviewInfo {
    const key = this.historicalKey(projectId, iterationId);
    const proc = this.historicalPreviews.get(key);
    if (!proc) {
      return { previewUrl: null, status: "stopped" };
    }
    proc.lastAccessedAt = Date.now();
    return this.toInfo(proc);
  }

  async stopHistoricalPreview(projectId: string, iterationId: number): Promise<void> {
    const key = this.historicalKey(projectId, iterationId);
    const proc = this.historicalPreviews.get(key);
    if (!proc) return;

    this.killProcess(proc);
    proc.status = "stopped";
    this.historicalPreviews.delete(key);
  }

  async stopAllHistorical(projectId: string): Promise<void> {
    const promises: Promise<void>[] = [];
    for (const [key, proc] of this.historicalPreviews) {
      if (proc.projectId === projectId) {
        this.killProcess(proc);
        proc.status = "stopped";
        this.historicalPreviews.delete(key);
      }
    }
    await Promise.all(promises);
  }

  // ── Cleanup ────────────────────────────────────────────────────────

  async stopAll(): Promise<void> {
    const promises: Promise<void>[] = [];
    for (const projectId of this.previews.keys()) {
      promises.push(this.stopPreview(projectId));
    }

    for (const [key, proc] of this.historicalPreviews) {
      this.killProcess(proc);
      proc.status = "stopped";
      this.historicalPreviews.delete(key);
    }

    await Promise.all(promises);

    if (this.reaperInterval) {
      clearInterval(this.reaperInterval);
      this.reaperInterval = null;
    }
  }

  // ── Internal methods ───────────────────────────────────────────────

  private async evictHistoricalIfNeeded(): Promise<void> {
    // Count active (non-stopped, non-error) historical previews
    const active: [string, PreviewProcess][] = [];
    for (const [key, proc] of this.historicalPreviews) {
      if (proc.status !== "stopped" && proc.status !== "error") {
        active.push([key, proc]);
      }
    }

    if (active.length < MAX_HISTORICAL_PREVIEWS) return;

    // Sort by lastAccessedAt ascending (oldest first)
    active.sort((a, b) => a[1].lastAccessedAt - b[1].lastAccessedAt);

    // Evict the least recently used
    const [evictKey, evictProc] = active[0];
    console.log(`[sandbox] Evicting historical preview: ${evictKey}`);
    this.killProcess(evictProc);
    evictProc.status = "stopped";
    this.historicalPreviews.delete(evictKey);
  }

  private async installAndSpawn(proc: PreviewProcess): Promise<void> {
    const packageJsonPath = join(proc.workspacePath, "package.json");
    if (!existsSync(packageJsonPath)) {
      // Self-heal: copy template into empty workspace
      if (this.templateDir && existsSync(this.templateDir)) {
        await cp(this.templateDir, proc.workspacePath, { recursive: true });
      } else {
        throw new Error("Workspace has no package.json and no template available to restore it");
      }
    }

    const nodeModulesPath = join(proc.workspacePath, "node_modules");

    // Install dependencies if needed
    if (!existsSync(nodeModulesPath)) {
      proc.status = "installing";
      await this.runInstall(proc.workspacePath);
    }

    // Spawn next dev
    proc.status = "starting";
    await this.spawnNextDev(proc);
  }

  private runInstall(workspacePath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn("npm", ["install", "--include=dev"], {
        cwd: workspacePath,
        env: cleanEnv(),
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stderr = "";
      child.stderr?.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      child.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`npm install exited with code ${code}: ${stderr.slice(0, 500)}`));
        }
      });

      child.on("error", reject);
    });
  }

  private spawnNextDev(proc: PreviewProcess): Promise<void> {
    return new Promise((resolve, reject) => {
      // Run next directly from node_modules to avoid npx shell wrapper
      const nextBin = join(proc.workspacePath, "node_modules", ".bin", "next");
      const child = spawn(
        nextBin,
        ["dev", "--port", String(proc.port)],
        {
          cwd: proc.workspacePath,
          detached: true,
          env: cleanEnv(),
          stdio: ["ignore", "pipe", "pipe"],
        }
      );

      proc.childProcess = child;

      let resolved = false;

      const onData = (chunk: Buffer) => {
        const text = chunk.toString();
        // Next.js prints "✓ Ready in X.Xs" or "- Local: http://localhost:XXXX"
        if (!resolved && (text.includes("Ready in") || text.includes("✓ Ready") || text.includes("Local:"))) {
          resolved = true;
          proc.status = "ready";
          resolve();
        }
      };

      child.stdout?.on("data", onData);
      child.stderr?.on("data", onData);

      child.on("close", (code) => {
        if (!resolved) {
          resolved = true;
          proc.status = "error";
          proc.error = `next dev exited with code ${code}`;
          reject(new Error(proc.error));
        } else {
          // Process exited after it was ready (crash or stop)
          proc.status = "error";
          proc.error = `next dev exited unexpectedly with code ${code}`;
        }
      });

      child.on("error", (err) => {
        if (!resolved) {
          resolved = true;
          proc.status = "error";
          proc.error = err.message;
          reject(err);
        }
      });

      // Timeout: if not ready after 120s, give up
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          proc.status = "error";
          proc.error = "Timed out waiting for next dev to start";
          this.killProcess(proc);
          reject(new Error(proc.error));
        }
      }, 120_000);
    });
  }

  private killProcess(proc: PreviewProcess): void {
    if (proc.childProcess && proc.childProcess.pid && !proc.childProcess.killed) {
      const pid = proc.childProcess.pid;
      try {
        // Kill the entire process group (negative PID) since we used detached: true
        process.kill(-pid, "SIGTERM");
      } catch {
        // Process might already be dead
      }
      // Force kill after 5s if still alive
      setTimeout(() => {
        try {
          process.kill(-pid, "SIGKILL");
        } catch {
          // Process already dead
        }
      }, 5000);
    }
  }

  private reapIdle(): void {
    const now = Date.now();

    // Reap latest previews
    for (const [projectId, proc] of this.previews) {
      if (proc.status === "ready" && now - proc.lastAccessedAt > TTL_MS) {
        console.log(`[sandbox] Reaping idle preview for project ${projectId}`);
        this.killProcess(proc);
        this.previews.delete(projectId);
      }
    }

    // Reap historical previews (shorter TTL)
    for (const [key, proc] of this.historicalPreviews) {
      if (proc.status === "ready" && now - proc.lastAccessedAt > HISTORICAL_TTL_MS) {
        console.log(`[sandbox] Reaping idle historical preview: ${key}`);
        this.killProcess(proc);
        this.historicalPreviews.delete(key);
      }
    }
  }

  private toInfo(proc: PreviewProcess): PreviewInfo {
    return {
      previewUrl: proc.previewUrl,
      status: proc.status,
      ...(proc.error ? { error: proc.error } : {}),
    };
  }
}
