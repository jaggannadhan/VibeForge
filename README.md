```
 __     ___ _            ____  _             _ _
 \ \   / (_) |__   ___  / ___|| |_ _   _  __| (_) ___
  \ \ / /| | '_ \ / _ \ \___ \| __| | | |/ _` | |/ _ \
   \ V / | | |_) |  __/  ___) | |_| |_| | (_| | | (_) |
    \_/  |_|_.__/ \___| |____/ \__|\__,_|\__,_|_|\___/
```

# Vibe Studio

**AI-powered design-to-code pipeline that turns Figma design packs into pixel-perfect, accessible Next.js pages — iteratively refined by a vision-scoring feedback loop.**

---

## What is Vibe Studio?

Vibe Studio is a full-stack platform that automates the translation of visual designs into production-quality frontend code. You upload a **design pack** (a structured bundle of baseline screenshots, a design IR manifest, and layout/style/a11y targets), and the system:

1. **Generates** a Next.js 14 page using Claude AI, guided by the design IR nodes
2. **Screenshots** the rendered output using Playwright at each target breakpoint
3. **Scores** the result against the baseline using Claude Vision across four dimensions — layout, style, accessibility, and perceptual similarity
4. **Iterates** — accepting improvements, rejecting regressions, and restoring from the best snapshot — until the score threshold is met or stop conditions trigger

The entire loop runs autonomously. A real-time WebSocket trace streams every step (code generation, screenshot capture, scoring, accept/reject decisions) to the browser UI so you can watch the agent work.

---

## Use Cases

- **Design Handoff Automation** — Convert Figma mockups into working Next.js pages without manual slicing. Upload a design pack and let the agent iterate until it matches.

- **Visual Regression Testing** — Use the scoring pipeline as a continuous visual QA system. The four-dimension scoring (layout, style, a11y, perceptual) catches regressions that unit tests miss.

- **Rapid Prototyping** — Go from a static design to a live, interactive prototype in minutes. The sandbox preview runs a real Next.js dev server so you can interact with the result immediately.

- **Accessibility Auditing** — The scoring pipeline evaluates semantic HTML, ARIA attributes, and interactive element accessibility on every iteration, enforcing a11y as a first-class constraint.

- **Design System Validation** — Verify that generated components correctly use your design tokens (colors, spacing, typography) by scoring against the baseline at multiple breakpoints.

---

## Architecture

```
+-----------+       WebSocket        +-----------+       Playwright       +----------+
|           | <--------------------> |           | --------------------> |          |
|  Next.js  |    REST API (/api)     |  Fastify  |    Claude API         | Sandbox  |
|  Frontend |  <-------------------> |  Backend  | ------------------->  | Preview  |
|  :3000    |                        |  :3001    |    Claude Vision      |  :5xxxx  |
+-----------+                        +-----------+                       +----------+

apps/web                             apps/api                            templates/
                                     packages/sandbox-runner              nextjs-tailwind-shadcn
```

### Monorepo Structure

```
AgentDOM/
  apps/
    api/               Fastify API server (port 3001)
    web/               Next.js frontend (port 3000)
  packages/
    shared/            Shared types, Zod schemas, contracts
    sandbox-runner/    Sandbox lifecycle manager
  templates/
    nextjs-tailwind-shadcn/   Base workspace template
  storage/             Project workspaces and artifacts (gitignored)
```

### Core Services (apps/api/src/services/)

| Service | Purpose |
|---|---|
| `ai-executor.ts` | Orchestrates the iteration loop: codegen -> screenshot -> scoring -> decision |
| `prompt-builder.ts` | Builds Claude prompts with design IR, feedback, patch plans, and overflow issues |
| `screenshot-service.ts` | Playwright-based screenshot capture at multiple breakpoints |
| `scoring-service.ts` | Claude Vision scoring across layout, style, a11y, and perceptual dimensions |
| `scorekeeper.ts` | Best-so-far tracking; accepts improvements, rejects regressions |
| `patch-planner.ts` | Focuses each iteration on the weakest dimension with change budgets |
| `lock-manager.ts` | Freezes converged nodes to prevent regressions |
| `stop-conditions.ts` | Terminates the loop on plateau, regression limit, or time budget |
| `overflow-detector.ts` | Playwright-based DOM scan for horizontal overflow issues |
| `snapshot-service.ts` | tar.gz workspace snapshots for rollback and historical preview |

---

## Installation

### Prerequisites

- **Node.js** >= 18.17.0
- **pnpm** >= 9.x (`npm install -g pnpm`)
- **Playwright browsers** (installed automatically on first run, or run `npx playwright install chromium`)
- An **Anthropic API key** with access to Claude Sonnet 4

### Setup

```bash
# Clone the repository
git clone <repo-url> AgentDOM
cd AgentDOM

# Install all dependencies
pnpm install

# Create the API environment file
cp apps/api/.env.example apps/api/.env
# Edit apps/api/.env and set your ANTHROPIC_API_KEY
```

If no `.env.example` exists, create `apps/api/.env` manually:

```env
ANTHROPIC_API_KEY=sk-ant-...
```

### Development

```bash
# Start everything (API + Web in parallel)
pnpm dev

# Or start individually
pnpm dev:api    # Fastify API on http://127.0.0.1:3001
pnpm dev:web    # Next.js frontend on http://localhost:3000
```

### Build

```bash
pnpm build        # Build all packages
pnpm typecheck    # Type-check all packages
pnpm lint         # Lint all packages
pnpm clean        # Remove build artifacts
```

### Verify

Open http://localhost:3000 in your browser. The API health check is at http://127.0.0.1:3001/api/health.

---

## Future Extensions

- **Per-Node Scoring** — Replace aggregate-level scoring with granular per-node layout and style error maps, enabling precise lock/unlock decisions and targeted feedback.

- **Multi-Page Support** — Extend the iteration loop to handle multi-route applications, with cross-page navigation testing and shared component convergence.

- **Figma Plugin** — A Figma plugin that exports design packs directly from the canvas, eliminating the manual export step.

- **Component Library Generation** — Extract reusable components from converged iterations and publish them as a versioned design system package.

- **CI/CD Integration** — Run the scoring pipeline in CI to catch visual regressions on every pull request, with automatic screenshot diffing and threshold enforcement.

- **Custom Model Support** — Allow plugging in alternative vision models (GPT-4V, Gemini) for scoring, and alternative code models for generation.

- **Collaborative Editing** — Real-time multi-user workspace with conflict resolution, allowing designers and developers to co-iterate on the same project.

- **Mobile-First Generation** — Priority responsive generation starting from mobile breakpoints, with progressive enhancement to desktop layouts.

---

## License

MIT License. See [LICENSE](LICENSE) for details.
