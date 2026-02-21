import { readdir, readFile, stat } from "node:fs/promises";
import { join, extname, relative } from "node:path";
import { existsSync } from "node:fs";
import type { FileTreeNode } from "@vibe-studio/shared";
import { workspaceDir } from "../lib/paths.js";

/** Directories and files to exclude from the file tree */
const EXCLUDED = new Set([
  "node_modules",
  ".next",
  ".git",
  ".DS_Store",
  ".env",
  ".env.local",
]);

/** Map file extension → language identifier for syntax display */
const EXT_TO_LANG: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "tsx",
  ".js": "javascript",
  ".jsx": "jsx",
  ".json": "json",
  ".css": "css",
  ".html": "html",
  ".md": "markdown",
  ".mdx": "mdx",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".svg": "svg",
  ".txt": "plaintext",
  ".sh": "shell",
  ".gitignore": "plaintext",
  ".gitkeep": "plaintext",
};

function detectLanguage(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  return EXT_TO_LANG[ext] ?? "plaintext";
}

/** Recursively walk a directory and build FileTreeNode[]. Paths are relative to wsRoot. */
async function walkDir(absDir: string, wsRoot: string): Promise<FileTreeNode[]> {
  const entries = await readdir(absDir, { withFileTypes: true });

  // Sort: directories first, then files, both alphabetical
  entries.sort((a, b) => {
    if (a.isDirectory() && !b.isDirectory()) return -1;
    if (!a.isDirectory() && b.isDirectory()) return 1;
    return a.name.localeCompare(b.name);
  });

  const nodes: FileTreeNode[] = [];

  for (const entry of entries) {
    if (EXCLUDED.has(entry.name)) continue;
    if (entry.name.startsWith(".")) continue;

    const absPath = join(absDir, entry.name);
    const relPath = relative(wsRoot, absPath);

    if (entry.isDirectory()) {
      const children = await walkDir(absPath, wsRoot);
      nodes.push({ name: entry.name, path: relPath, type: "directory", children });
    } else if (entry.isFile()) {
      nodes.push({ name: entry.name, path: relPath, type: "file" });
    }
  }

  return nodes;
}

export async function getWorkspaceTree(projectId: string): Promise<FileTreeNode[]> {
  const wsDir = workspaceDir(projectId);
  if (!existsSync(wsDir)) return [];
  return walkDir(wsDir, wsDir);
}

export interface WorkspaceFileContent {
  path: string;
  content: string;
  language: string;
}

export async function getWorkspaceFileContent(
  projectId: string,
  filePath: string
): Promise<WorkspaceFileContent | null> {
  const wsDir = workspaceDir(projectId);
  const absPath = join(wsDir, filePath);

  // Prevent path traversal
  if (!absPath.startsWith(wsDir)) return null;

  if (!existsSync(absPath)) return null;

  const fileStat = await stat(absPath);
  if (!fileStat.isFile()) return null;

  const content = await readFile(absPath, "utf-8");
  return { path: filePath, content, language: detectLanguage(filePath) };
}
