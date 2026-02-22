import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import type { IRNode } from "@vibe-studio/shared";

const MODEL = "claude-sonnet-4-20250514";
const MAX_TOKENS = 1024;

// Weights for computing overall score
const WEIGHTS = { layout: 0.3, style: 0.3, a11y: 0.2, perceptual: 0.2 };

export interface ScoringOptions {
  screenshotPath: string;
  baselinePath: string;
  breakpointId: string;
  irNodes: IRNode[];
  signal?: AbortSignal;
}

export interface BreakpointScore {
  breakpointId: string;
  overall: number;
  layout: number;
  style: number;
  a11y: number;
  perceptual: number;
}

export interface AggregateScore {
  overall: number;
  layout: number;
  style: number;
  a11y: number;
  perceptual: number;
  perBreakpoint: BreakpointScore[];
}

const SYSTEM_PROMPT = `You are a visual QA scorer that compares a generated screenshot against a baseline design image.

You will receive two images:
1. The BASELINE (reference design) — this is the intended design
2. The SCREENSHOT (actual render) — this is what was generated

You will also receive the Design IR (intermediate representation) that describes the intended layout, styling, and accessibility properties of each component.

Score each dimension from 0.0 to 1.0:

- **layout**: How accurately does the screenshot match the baseline's layout? Consider element positioning, sizing, spacing, alignment, and responsive behavior. 1.0 = pixel-perfect match.
- **style**: How closely do colors, typography, borders, shadows, and visual styling match? 1.0 = identical styling.
- **a11y**: Based on the Design IR's a11y targets (roles, labels), does the screenshot appear to render semantic elements correctly? Are interactive elements visually distinguishable? 1.0 = all a11y targets appear met.
- **perceptual**: Overall visual similarity — would a human say these look the same at a glance? 1.0 = indistinguishable.

Return ONLY valid JSON with exactly these four numeric fields:
{"layout": 0.0, "style": 0.0, "a11y": 0.0, "perceptual": 0.0}

Be strict but fair. Minor differences in anti-aliasing or sub-pixel rendering should not heavily penalize scores.`;

export class ScoringService {
  private client: Anthropic;

  constructor() {
    this.client = new Anthropic();
  }

  async scoreBreakpoint(options: ScoringOptions): Promise<BreakpointScore> {
    const { screenshotPath, baselinePath, breakpointId, irNodes, signal } = options;

    if (!existsSync(baselinePath)) {
      throw new Error(`Baseline not found: ${baselinePath}`);
    }
    if (!existsSync(screenshotPath)) {
      throw new Error(`Screenshot not found: ${screenshotPath}`);
    }

    const [baselineData, screenshotData] = await Promise.all([
      readFile(baselinePath),
      readFile(screenshotPath),
    ]);

    const baselineB64 = baselineData.toString("base64");
    const screenshotB64 = screenshotData.toString("base64");

    // Build concise IR summary for context
    const irSummary = irNodes.map((n) => ({
      nodeId: n.nodeId,
      name: n.name,
      importance: n.matchImportance,
      layout: n.layoutTargets,
      style: n.styleTargets,
      a11y: n.a11yTargets,
    }));

    const response = await this.client.messages.create(
      {
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Breakpoint: ${breakpointId}\n\nDesign IR nodes:\n${JSON.stringify(irSummary, null, 2)}\n\nBelow are two images. The first is the BASELINE (reference design). The second is the SCREENSHOT (generated render). Score them.`,
              },
              {
                type: "image",
                source: { type: "base64", media_type: "image/png", data: baselineB64 },
              },
              {
                type: "image",
                source: { type: "base64", media_type: "image/png", data: screenshotB64 },
              },
            ],
          },
        ],
      },
      { signal }
    );

    // Extract text from response
    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("");

    const scores = parseScores(text);

    const overall =
      scores.layout * WEIGHTS.layout +
      scores.style * WEIGHTS.style +
      scores.a11y * WEIGHTS.a11y +
      scores.perceptual * WEIGHTS.perceptual;

    return {
      breakpointId,
      overall: round(overall),
      layout: round(scores.layout),
      style: round(scores.style),
      a11y: round(scores.a11y),
      perceptual: round(scores.perceptual),
    };
  }

  async scoreAll(
    breakpointOptions: ScoringOptions[],
    onScored?: (score: BreakpointScore) => void
  ): Promise<AggregateScore> {
    const perBreakpoint: BreakpointScore[] = [];

    for (const options of breakpointOptions) {
      const score = await this.scoreBreakpoint(options);
      perBreakpoint.push(score);
      onScored?.(score);
    }

    if (perBreakpoint.length === 0) {
      return { overall: 0, layout: 0, style: 0, a11y: 0, perceptual: 0, perBreakpoint: [] };
    }

    const avg = (key: keyof Omit<BreakpointScore, "breakpointId">) =>
      round(perBreakpoint.reduce((sum, s) => sum + s[key], 0) / perBreakpoint.length);

    return {
      overall: avg("overall"),
      layout: avg("layout"),
      style: avg("style"),
      a11y: avg("a11y"),
      perceptual: avg("perceptual"),
      perBreakpoint,
    };
  }
}

// ── Helpers ──────────────────────────────────────────────────────────

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function parseScores(text: string): { layout: number; style: number; a11y: number; perceptual: number } {
  // Extract JSON from response (may have markdown fences)
  const jsonMatch = text.match(/\{[\s\S]*?\}/);
  if (!jsonMatch) {
    console.warn("[ScoringService] Failed to extract JSON from response:", text);
    return { layout: 0.5, style: 0.5, a11y: 0.5, perceptual: 0.5 };
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      layout: clamp(Number(parsed.layout) || 0),
      style: clamp(Number(parsed.style) || 0),
      a11y: clamp(Number(parsed.a11y) || 0),
      perceptual: clamp(Number(parsed.perceptual) || 0),
    };
  } catch {
    console.warn("[ScoringService] Failed to parse JSON:", jsonMatch[0]);
    return { layout: 0.5, style: 0.5, a11y: 0.5, perceptual: 0.5 };
  }
}

function clamp(n: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, n));
}
