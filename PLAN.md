# Implementation Plan: Auto Preview + New Project Overlay + Design-in-Workspace

## Overview

This plan implements 5 changes per the A&D:
1. Auto-start preview on app load (remove "Preview" button gate)
2. Replace "Upload Images" with "New Project" button + fullscreen overlay
3. Backend endpoints: upload zip + generate design files into sandbox workspace
4. File tree refresh + auto-expand new designs directory
5. Run button gating + bind Run to workspace design directory

---

## Step 1: Auto-start Preview on App Load

**Goal**: When the app loads and a project is ready, the preview dev server starts automatically. No "Preview" button needed.

### Changes:

**`apps/web/src/components/layout/PreviewPane.tsx`**
- Add a new `useEffect` that calls `handleStart()` on mount when `preview.status === "stopped"` and no `overridePreviewUrl` is set.
- Replace the current idle state UI (lines 420-441, the "Preview not running" + Preview button) with a loading skeleton/spinner that says "Starting preview..." — since auto-start means users never see the idle state.
- Keep the error state with "Retry" button (still useful if auto-start fails).
- Remove the existing `autoStart` prop logic (lines 123-129) and replace with unconditional auto-start on mount.

**`apps/web/src/components/layout/CenterPane.tsx`**
- Remove the `autoStart` prop passthrough (no longer needed).

**`apps/web/src/components/layout/ThreePaneLayout.tsx`**
- Remove `previewAutoStart` prop.

**`apps/web/src/components/layout/ProjectWorkspace.tsx`**
- Remove `previewAutoStart` state and its usage.
- In `handleRunComplete`, remove `setPreviewAutoStart(true)` (preview is already running).

---

## Step 2: New Project Overlay UI

**Goal**: Replace "Upload Images" button with "New Project". Clicking opens a fullscreen overlay with upload → generate flow.

### New file: `apps/web/src/components/layout/NewProjectOverlay.tsx`

Fullscreen overlay component with two states:

**State 1 — Upload ZIP**:
- Project name input (editable, default from current project name)
- Drag-and-drop zone for .zip file (images only)
- Helper text: "Upload a zip containing images (desktop/default.png, mobile/default.png optional)."
- Close/cancel button (X in top-right)

**State 2 — Create design files**:
- After successful upload: hide upload UI, show upload summary (detected breakpoints)
- Single primary button: "Create design files"
- On click: spinner + "Generating design files..." text, disable close
- On success: auto-close overlay after brief toast
- On error: show error message with retry option

**Props**:
```typescript
interface NewProjectOverlayProps {
  projectId: string;
  projectName: string;
  onClose: () => void;
  onComplete: (designDir: string) => void;  // called after successful generation
}
```

### Changes to `apps/web/src/components/layout/ProjectHeader.tsx`:
- Remove the hidden `<input type="file">` and `Upload Images` button (lines 137-154)
- Remove drag-and-drop handlers on the header (lines 76-101)
- Remove `uploading` and `onDesignPackUploaded` props
- Add `onNewProject` callback prop
- Add "New Project" button that calls `onNewProject()`

### Changes to `apps/web/src/components/layout/ProjectWorkspace.tsx`:
- Add `showOverlay` boolean state
- Remove `uploading`, `uploadResult`, `handleDesignPackUpload`, `dismissResult` state/handlers
- Remove the upload result banner (lines 294-322)
- Add `handleNewProjectComplete(designDir)` callback:
  - Sets `activeDesignDir` (new state, replaces `activePackId`)
  - Refreshes file tree
  - Triggers auto-expand of the new designs directory
- Wire `<NewProjectOverlay>` to render when `showOverlay` is true
- Wire `<ProjectHeader onNewProject={() => setShowOverlay(true)} />`

---

## Step 3: Backend Endpoints

### 3a: New path helper in `apps/api/src/lib/paths.ts`

```typescript
export function workspaceDesignsDir(projectId: string, projectName: string): string {
  return join(workspaceDir(projectId), "src", "designs", projectName);
}
```

### 3b: New ID helper in `apps/api/src/lib/ids.ts`

```typescript
export function newUploadId(): string {
  return `u_${nanoid(12)}`;
}
```

### 3c: New route file: `apps/api/src/routes/design-zip.ts`

**`POST /api/projects/:projectId/design-zip`**
- Multipart form upload (single .zip file)
- Extract to temp directory
- Scan for PNGs, infer breakpoints (reuse `readPngDimensions` from pack-generator)
- Store extracted images in a temp/staging area: `storage/projects/<projectId>/uploads/<uploadId>/`
- Return:
  ```json
  {
    "uploadId": "u_abc123",
    "detected": {
      "desktop": { "exists": true, "width": 1440, "height": 900 },
      "mobile": { "exists": true, "width": 390, "height": 844 }
    },
    "states": ["default"]
  }
  ```

**`POST /api/projects/:projectId/design-files`**
- Body: `{ "uploadId": "u_abc123", "projectName": "H-care" }`
- Sanitize `projectName` for filesystem (replace spaces/special chars)
- Resolve workspace path: `workspaceDir(projectId)/src/designs/<sanitized_name>/`
- Reuse pack-generator logic to:
  1. Generate `manifest.json` (combined desktop+mobile)
  2. Generate `design-ir.json` (draft IR with app-shell + content nodes)
  3. Copy baseline images into `baselines/<breakpointId>/<stateId>.png`
  4. Write `notes.json` with `{ draftGenerated: true }`
- Return:
  ```json
  {
    "success": true,
    "designDir": "src/designs/h-care",
    "files": ["manifest.json", "design-ir.json", "notes.json"]
  }
  ```

### 3d: Refactor `apps/api/src/services/pack-generator.ts`

- Extract the core generation logic (manifest + IR + image reorganization) into a function that takes an `outputDir` parameter instead of always writing to the pack directory.
- Expose: `generateDesignFiles(sourceImagesDir: string, outputDir: string, projectName: string): Promise<GenerationResult>`
- The existing `generateDesignPack()` function becomes a thin wrapper that calls `generateDesignFiles()`.

### 3e: Register new routes in `apps/api/src/server.ts`

```typescript
import { designZipRoutes } from "./routes/design-zip.js";
// ...
await app.register(designZipRoutes, { prefix: "/api" });
```

### 3f: New API functions in `apps/web/src/lib/api.ts`

```typescript
export async function uploadDesignZip(projectId: string, file: File): Promise<DesignZipUploadResponse>
export async function createDesignFiles(projectId: string, uploadId: string, projectName: string): Promise<DesignFilesResponse>
```

### 3g: WebSocket events (recommended, non-blocking)

Add to existing WS infrastructure:
- `design.uploaded` — emitted after zip upload success
- `design.generation.started` — emitted when "Create design files" begins
- `design.generation.completed` — emitted on success/failure

---

## Step 4: File Tree Auto-Expand

**Goal**: After design files are generated, refresh the file tree and auto-expand `src/designs/<project_name>/`.

### Changes to `apps/web/src/components/filetree/FileTree.tsx`:
- Add optional `autoExpandPaths?: string[]` prop
- In `getDefaultExpanded()` or in a `useEffect`, when `autoExpandPaths` changes, add all ancestor paths and the paths themselves to `expandedPaths`

### Changes to `apps/web/src/components/layout/FileTreePane.tsx`:
- Add `autoExpandPaths?: string[]` prop
- Pass through to `<FileTree autoExpandPaths={autoExpandPaths} />`

### Changes to `apps/web/src/components/layout/ThreePaneLayout.tsx`:
- Add `autoExpandPaths?: string[]` prop, pass to `<FileTreePane>`

### Changes to `apps/web/src/components/layout/ProjectWorkspace.tsx`:
- Add `autoExpandPaths` state
- Set it in `handleNewProjectComplete()`:
  ```typescript
  setAutoExpandPaths(["src", "src/designs", `src/designs/${name}`, ...])
  ```

---

## Step 5: Run Button — Gate on Design Dir + Bind to Workspace Designs

**Goal**: Run reads design files from `<workspace>/src/designs/<name>/` instead of `artifacts/design-packs/<packId>/`.

### Frontend changes:

**`apps/web/src/components/layout/ProjectWorkspace.tsx`**:
- Replace `activePackId` state with `activeDesignDir: string | null` (e.g. `"src/designs/h-care"`)
- `canRun` = `!!activeDesignDir`
- `handleRun()` calls `startRun(projectId, activeDesignDir)` instead of `startRun(projectId, activePackId)`
- Pass `null` for `packId` in `<ThreePaneLayout>` / `<CenterPane>` (baseline pane can be updated later)

**`apps/web/src/lib/api.ts`**:
- Modify `startRun()` to send `{ designDir }` instead of `{ packId }`

### Backend changes:

**`apps/api/src/routes/runs.ts`**:
- Change body type from `{ packId }` to `{ designDir: string }`
- Resolve absolute path: `join(workspaceDir(projectId), designDir)`
- Validate the directory exists and contains `manifest.json`
- Call `runService.startRun(projectId, designDir, wsPath)`

**`apps/api/src/services/run-service.ts`**:
- Rename `packId` to `designDir` in `RunState` and `startRun()` signature
- Pass `designDir` to executor options

**`apps/api/src/services/executor.ts`**:
- Change `ExecutorOptions.packId` to `designDir: string`

**`apps/api/src/services/ai-executor.ts`** (line 70-72):
- Instead of `designPackDir(projectId, packId)`, use `join(workspacePath, designDir)` to read `manifest.json` and `design-ir.json`
- Baseline images path: `join(workspacePath, designDir, "baselines", ...)`
- Update the `emitEvent` calls that reference `packId` to use `designDir`

**Tooltip for disabled Run button**:
- In `ProjectHeader.tsx`, add `title="Create design files first"` when `canRun` is false

---

## File Change Summary

| File | Action |
|------|--------|
| `apps/web/src/components/layout/PreviewPane.tsx` | Modify — auto-start on mount |
| `apps/web/src/components/layout/CenterPane.tsx` | Modify — remove autoStart prop |
| `apps/web/src/components/layout/ThreePaneLayout.tsx` | Modify — remove previewAutoStart, add autoExpandPaths |
| `apps/web/src/components/layout/ProjectWorkspace.tsx` | Modify — overlay state, remove upload, designDir replaces packId |
| `apps/web/src/components/layout/ProjectHeader.tsx` | Modify — "New Project" replaces "Upload Images" |
| `apps/web/src/components/layout/NewProjectOverlay.tsx` | **New** — fullscreen overlay |
| `apps/web/src/components/layout/FileTreePane.tsx` | Modify — autoExpandPaths |
| `apps/web/src/components/filetree/FileTree.tsx` | Modify — autoExpandPaths |
| `apps/web/src/lib/api.ts` | Modify — new API functions, update startRun |
| `apps/api/src/routes/design-zip.ts` | **New** — upload + generate endpoints |
| `apps/api/src/lib/paths.ts` | Modify — add workspaceDesignsDir helper |
| `apps/api/src/lib/ids.ts` | Modify — add newUploadId |
| `apps/api/src/services/pack-generator.ts` | Modify — extract reusable generation function |
| `apps/api/src/server.ts` | Modify — register new routes |
| `apps/api/src/routes/runs.ts` | Modify — designDir instead of packId |
| `apps/api/src/services/run-service.ts` | Modify — designDir instead of packId |
| `apps/api/src/services/executor.ts` | Modify — designDir instead of packId |
| `apps/api/src/services/ai-executor.ts` | Modify — read from workspace designs dir |

---

## Implementation Order

1. **Step 1** — Auto preview (PreviewPane, CenterPane, ThreePaneLayout, ProjectWorkspace)
2. **Step 3** — Backend endpoints first (paths, ids, pack-generator refactor, design-zip routes, server registration)
3. **Step 2** — New Project overlay UI (NewProjectOverlay, ProjectHeader, api.ts, ProjectWorkspace)
4. **Step 4** — File tree auto-expand (FileTree, FileTreePane, ThreePaneLayout, ProjectWorkspace)
5. **Step 5** — Run binding (api.ts, runs.ts, run-service.ts, executor.ts, ai-executor.ts, ProjectWorkspace, ProjectHeader)
