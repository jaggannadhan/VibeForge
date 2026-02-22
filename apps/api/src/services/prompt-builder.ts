import type { IRNode, Breakpoint } from "@vibe-studio/shared";

export interface PromptParts {
  system: string;
  user: string;
}

export interface PromptOptions {
  projectName: string;
  targetId: string;
  route: string;
  fileHint: string;
  nodes: IRNode[];
  breakpoints: Breakpoint[];
  existingLayout: string;
  existingGlobalsCss: string;
  // Iteration feedback (set for iteration > 0)
  iterationIndex?: number;
  previousCode?: string;
  previousScore?: { layout: number; style: number; a11y: number; perceptual: number };
  // PatchPlanner output (set for iteration > 0)
  patchPlan?: {
    focusArea: string;
    topTargets: { nodeId: string; name: string; mismatchType: string; severity: number }[];
    budgets: { maxFilesChanged: number; maxLinesChanged: number; maxStructureChanges: number };
    disallowedChanges: string[];
    lockedNodeIds?: string[];
  };
  // Overflow report from previous iteration
  overflowIssues?: { selector: string; nodeId: string | null; overflowPx: number }[];
}

export function buildCodeGenPrompt(options: PromptOptions): PromptParts {
  const system = buildSystemPrompt();
  const user = buildUserPrompt(options);
  return { system, user };
}

function buildSystemPrompt(): string {
  return `You are a senior frontend developer building a Next.js 14 App Router page using Tailwind CSS 3 and shadcn/ui conventions.

Technology stack available in this workspace:
- Next.js 14 (App Router, React Server Components by default)
- React 18
- Tailwind CSS 3 with shadcn/ui color system (CSS variables: --background, --foreground, --primary, --secondary, --muted, --accent, --destructive, --card, --popover, --border, --input, --ring, --radius)
- lucide-react for icons
- @radix-ui/react-slot
- class-variance-authority, clsx, tailwind-merge (cn() helper available from "@/lib/utils")

Output rules:
1. Return ONLY valid XML in the format specified below. No markdown, no explanation, no commentary.
2. Each file must be wrapped in <file> tags with a "path" attribute relative to the workspace src/ directory.
3. The primary page component must be a default export.
4. Use "use client" directive only when the component requires interactivity (event handlers, useState, useEffect).
5. Use Tailwind utility classes for all styling. Map the Design IR style targets to Tailwind classes.
6. Use semantic HTML elements and ARIA attributes as specified in the a11y targets.
7. For layout, interpret the bbox coordinates as relative positioning guidance — use flexbox/grid to approximate the layout structure, not absolute positioning.
8. Components mentioned in componentMapping are design-intent hints, not literal imports. Implement them inline or as locally defined components.
9. Use the shadcn/ui color system CSS variables (e.g., bg-primary, text-muted-foreground) when colors approximately match.
10. All components must be valid TypeScript/TSX.
11. Do not import or reference files that don't exist. Only import from "@/lib/utils" (cn helper) and standard packages.
12. OVERFLOW PREVENTION (critical — must follow for every component):
    - Every flex row containing text must have \`min-w-0\` on BOTH the flex container AND the text child.
    - Single-line text (nav labels, button labels, user names, compact headings): use \`min-w-0 truncate\` on the text element.
    - Wrappable text (card titles, descriptions): use \`break-words\` and avoid fixed heights.
    - Large numbers (KPIs, metrics): use \`tabular-nums\` and responsive font sizes (\`text-2xl md:text-3xl\`). If potentially long, add \`truncate\` with a \`title\` attribute for the full value.
    - Icon + label patterns: icon gets \`shrink-0\`, label gets \`min-w-0 truncate\`.
    - NEVER rely on content fitting at a specific width — always plan for truncation or wrapping.
13. RESPONSIVE LAYOUT (critical — the UI must work at any viewport width):
    - Use responsive grid primitives. KPI/stat rows: \`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4\`. Main content regions: \`grid grid-cols-1 xl:grid-cols-3 gap-6\` with wide cards spanning \`xl:col-span-2\`.
    - Sidebar + content layouts: sidebar gets \`w-[240px] shrink-0\` (or collapsible), content area gets \`flex-1 min-w-0\`.
    - Avoid fixed pixel widths on content cards/grids that assume a specific viewport width.
    - Use \`w-full max-w-full\` on containers that could overflow their parent.
    - Tables: wrap in \`overflow-x-auto\` container.

Output format:
<files>
  <file path="app/page.tsx">
    // file content here
  </file>
  <file path="components/ui/some-component.tsx">
    // optional additional component files
  </file>
</files>`;
}

function buildUserPrompt(options: PromptOptions): string {
  const {
    projectName,
    targetId,
    route,
    fileHint,
    nodes,
    breakpoints,
    existingLayout,
    existingGlobalsCss,
  } = options;

  const primaryBreakpoint = breakpoints[0];
  const viewportInfo = primaryBreakpoint
    ? `${primaryBreakpoint.width}x${primaryBreakpoint.height}`
    : "1440x900";

  const nodeSpecs = nodes.map(formatNode).join("\n\n");

  return `Generate the page component for route "${route}" in project "${projectName}".

Target: ${targetId}
Primary file: src/${fileHint}
Design viewport: ${viewportInfo}

## Design Specification (IR Nodes)

The following nodes describe the visual elements on this page. Each node includes:
- Layout targets: bounding box (x, y, w, h in pixels at ${viewportInfo} viewport) for spatial guidance
- Style targets: font, color, and decoration specifications
- A11y targets: ARIA roles and labels
- Component mapping: design-intent component names and props (hints, not literal imports)
- Match importance: "critical" nodes MUST be present, "normal" should be present, "low" are optional

### Nodes:

${nodeSpecs}

## Existing Layout Context

The root layout (layout.tsx) already provides the HTML shell, font loading, and body wrapper:
\`\`\`tsx
${existingLayout}
\`\`\`

The global CSS (globals.css) provides these theme variables:
\`\`\`css
${existingGlobalsCss}
\`\`\`

Generate the implementation now. Remember: output ONLY the <files>...</files> XML block.${buildFeedbackSection(options)}`;
}

function formatNode(node: IRNode): string {
  const lines: string[] = [];

  lines.push(
    `#### Node: "${node.name}" (ID: ${node.nodeId}, Importance: ${node.matchImportance})`
  );

  if (node.componentMapping) {
    const propsStr =
      Object.keys(node.componentMapping.props).length > 0
        ? ` with props: ${JSON.stringify(node.componentMapping.props)}`
        : "";
    lines.push(
      `  Component hint: <${node.componentMapping.component}>${propsStr}`
    );
  }

  if (node.layoutTargets?.bbox) {
    const { x, y, w, h } = node.layoutTargets.bbox;
    lines.push(`  Layout: x=${x}, y=${y}, w=${w}, h=${h}px`);
  }

  const styles = formatStyleTargets(node.styleTargets);
  if (styles) {
    lines.push(`  Styles: ${styles}`);
  }

  const a11y = formatA11yTargets(node.a11yTargets);
  if (a11y) {
    lines.push(`  A11y: ${a11y}`);
  }

  return lines.join("\n");
}

function formatStyleTargets(
  styles: IRNode["styleTargets"]
): string | null {
  if (!styles) return null;

  const parts: string[] = [];
  if (styles.fontFamily) parts.push(`fontFamily="${styles.fontFamily}"`);
  if (styles.fontSizePx) parts.push(`fontSize=${styles.fontSizePx}px`);
  if (styles.fontWeight) parts.push(`fontWeight=${styles.fontWeight}`);
  if (styles.lineHeightPx)
    parts.push(`lineHeight=${styles.lineHeightPx}px`);
  if (styles.color) parts.push(`color=${styles.color}`);
  if (styles.backgroundColor)
    parts.push(`backgroundColor=${styles.backgroundColor}`);
  if (styles.borderRadiusPx)
    parts.push(`borderRadius=${styles.borderRadiusPx}px`);
  if (styles.boxShadow) parts.push(`boxShadow="${styles.boxShadow}"`);

  return parts.length > 0 ? parts.join(", ") : null;
}

function formatA11yTargets(
  a11y: IRNode["a11yTargets"]
): string | null {
  if (!a11y) return null;

  const parts: string[] = [];
  if (a11y.role) parts.push(`role="${a11y.role}"`);
  if (a11y.name) parts.push(`name="${a11y.name}"`);
  if (a11y.labelledByNodeId)
    parts.push(`labelledBy="${a11y.labelledByNodeId}"`);

  return parts.length > 0 ? parts.join(", ") : null;
}

function buildFeedbackSection(options: PromptOptions): string {
  const { iterationIndex, previousCode, previousScore, patchPlan } = options;
  if (!iterationIndex || !previousScore) return "";

  const pct = (n: number) => `${(n * 100).toFixed(0)}%`;

  let section = `

## Iteration Feedback

This is iteration ${iterationIndex + 1}. The previous attempt was scored by a visual QA system:
- Layout: ${pct(previousScore.layout)}
- Style: ${pct(previousScore.style)}
- Accessibility: ${pct(previousScore.a11y)}
- Perceptual similarity: ${pct(previousScore.perceptual)}`;

  if (patchPlan) {
    // Targeted patch plan — replaces generic "weakest area" guidance
    section += `

### Patch Plan — Focus: ${patchPlan.focusArea.toUpperCase()}

You must focus this iteration on improving **${patchPlan.focusArea}**. Do NOT make changes unrelated to this focus area.`;

    if (patchPlan.topTargets.length > 0) {
      section += `

**Target nodes to fix:**
${patchPlan.topTargets.map((t) => `- "${t.name}" (${t.nodeId}): ${t.mismatchType}`).join("\n")}`;
    }

    section += `

**Change budgets — you MUST stay within these limits:**
- Maximum files changed: ${patchPlan.budgets.maxFilesChanged}
- Maximum lines changed: ${patchPlan.budgets.maxLinesChanged}
- Maximum structural changes (new components/elements): ${patchPlan.budgets.maxStructureChanges}`;

    if (patchPlan.disallowedChanges.length > 0) {
      section += `

**Disallowed changes (do NOT touch):**
${patchPlan.disallowedChanges.map((c) => `- ${c}`).join("\n")}`;
    }

    if (patchPlan.lockedNodeIds && patchPlan.lockedNodeIds.length > 0) {
      section += `

**Locked nodes (do NOT modify — they already meet their targets):**
${patchPlan.lockedNodeIds.map((id) => `- ${id}`).join("\n")}`;
    }
  } else {
    // Fallback: generic weakest area guidance
    const areas = [
      { name: "layout", score: previousScore.layout },
      { name: "style", score: previousScore.style },
      { name: "a11y", score: previousScore.a11y },
      { name: "perceptual", score: previousScore.perceptual },
    ];
    areas.sort((a, b) => a.score - b.score);
    const weakest = areas.filter((a) => a.score < 0.9);

    if (weakest.length > 0) {
      section += `

**Focus areas for improvement:** ${weakest.map((a) => `${a.name} (${pct(a.score)})`).join(", ")}`;
    }
  }

  if (options.overflowIssues && options.overflowIssues.length > 0) {
    section += `

### Overflow Issues Detected

The following elements have horizontal overflow — text or content exceeds their container width. Fix these by applying \`min-w-0 truncate\` on text elements, \`min-w-0\` on flex children, or \`break-words\` on wrappable text:
${options.overflowIssues.map((o) => `- \`${o.selector}\`: overflows by ${o.overflowPx}px${o.nodeId ? ` (node: ${o.nodeId})` : ""}`).join("\n")}`;
  }

  if (previousCode) {
    section += `

### Previous Implementation

Refine the following code to improve the scores. Do not rewrite from scratch — make targeted improvements.

\`\`\`tsx
${previousCode}
\`\`\``;
  }

  return section;
}
