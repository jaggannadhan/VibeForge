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

Generate the implementation now. Remember: output ONLY the <files>...</files> XML block.`;
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
