/**
 * PatchPlanner — selects the weakest scoring dimension for each iteration
 * and produces a targeted patch plan with change budgets.
 */

import type { IRNode } from "@vibe-studio/shared";

// Same weights as scoring-service.ts
const WEIGHTS: Record<string, number> = {
  layout: 0.3,
  style: 0.3,
  a11y: 0.2,
  perceptual: 0.2,
};

export interface ScoreDimensions {
  layout: number;
  style: number;
  a11y: number;
  perceptual: number;
}

export interface TargetNode {
  nodeId: string;
  name: string;
  mismatchType: string;
  severity: number;
}

export interface PatchBudgets {
  maxFilesChanged: number;
  maxLinesChanged: number;
  maxStructureChanges: number;
}

export interface PatchPlan {
  focusArea: string;
  topTargets: TargetNode[];
  budgets: PatchBudgets;
  disallowedChanges: string[];
}

export class PatchPlanner {
  private readonly topK: number;
  private readonly defaultBudgets: PatchBudgets;
  private readonly disallowedChanges: string[];

  constructor(options?: {
    topK?: number;
    budgets?: Partial<PatchBudgets>;
    disallowedChanges?: string[];
  }) {
    this.topK = options?.topK ?? 3;
    this.defaultBudgets = {
      maxFilesChanged: options?.budgets?.maxFilesChanged ?? 2,
      maxLinesChanged: options?.budgets?.maxLinesChanged ?? 80,
      maxStructureChanges: options?.budgets?.maxStructureChanges ?? 1,
    };
    this.disallowedChanges = options?.disallowedChanges ?? [
      "routing",
      "dependencies",
      "global-styles",
    ];
  }

  /**
   * Produce a patch plan given the previous iteration's scores,
   * the IR nodes, and any locked node IDs.
   */
  plan(
    previousScore: ScoreDimensions,
    irNodes: IRNode[],
    lockedNodeIds: Set<string>
  ): PatchPlan {
    // 1. Select focus area = argmax(weightedError)
    const focusArea = this.selectFocusArea(previousScore);

    // 2. Select top-K target nodes (exclude locked)
    const unlocked = irNodes.filter((n) => !lockedNodeIds.has(n.nodeId));
    const topTargets = this.selectTargets(unlocked, focusArea);

    return {
      focusArea,
      topTargets,
      budgets: { ...this.defaultBudgets },
      disallowedChanges: [...this.disallowedChanges],
    };
  }

  /**
   * Select the dimension with the highest weighted error.
   * weightedError = weight[dim] * (1 - score[dim])
   */
  private selectFocusArea(score: ScoreDimensions): string {
    let maxError = -Infinity;
    let focusDim = "layout";

    for (const dim of ["layout", "style", "a11y", "perceptual"] as const) {
      const error = WEIGHTS[dim] * (1 - score[dim]);
      if (error > maxError) {
        maxError = error;
        focusDim = dim;
      }
    }

    return focusDim;
  }

  /**
   * Select the top-K nodes most relevant to the focus area.
   * Prioritize critical nodes, then normal, then low.
   * Severity is estimated from the node's importance and relevance to the focus area.
   */
  private selectTargets(nodes: IRNode[], focusArea: string): TargetNode[] {
    const importanceWeight: Record<string, number> = {
      critical: 1.0,
      normal: 0.6,
      low: 0.3,
    };

    const scored = nodes.map((node) => {
      const impWeight = importanceWeight[node.matchImportance] ?? 0.6;
      const relevance = this.getRelevance(node, focusArea);
      const severity = impWeight * relevance;
      const mismatchType = this.getMismatchType(node, focusArea);

      return {
        nodeId: node.nodeId,
        name: node.name,
        mismatchType,
        severity,
      };
    });

    // Sort by severity descending, take top K
    scored.sort((a, b) => b.severity - a.severity);
    return scored.slice(0, this.topK);
  }

  /**
   * Estimate how relevant a node is to the focus area.
   * Nodes with richer targets for the focus dimension score higher.
   */
  private getRelevance(node: IRNode, focusArea: string): number {
    switch (focusArea) {
      case "layout": {
        // Nodes with explicit bbox targets are most relevant
        return node.layoutTargets?.bbox ? 1.0 : 0.3;
      }
      case "style": {
        // Nodes with more style properties are more relevant
        const styleProps = Object.values(node.styleTargets || {}).filter(
          (v) => v !== undefined
        ).length;
        return Math.min(1.0, styleProps / 4);
      }
      case "a11y": {
        // Nodes with a11y targets are most relevant
        const a11yProps = Object.values(node.a11yTargets || {}).filter(
          (v) => v !== undefined
        ).length;
        return a11yProps > 0 ? 1.0 : 0.2;
      }
      case "perceptual":
        // All nodes contribute to perceptual similarity
        return node.matchImportance === "critical" ? 1.0 : 0.5;
      default:
        return 0.5;
    }
  }

  /**
   * Describe the type of mismatch for a node given the focus area.
   */
  private getMismatchType(node: IRNode, focusArea: string): string {
    switch (focusArea) {
      case "layout":
        return node.layoutTargets?.bbox
          ? "position/size mismatch"
          : "missing layout constraints";
      case "style": {
        const props = [];
        if (node.styleTargets?.fontFamily) props.push("font");
        if (node.styleTargets?.color || node.styleTargets?.backgroundColor) props.push("color");
        if (node.styleTargets?.borderRadiusPx !== undefined) props.push("border-radius");
        if (node.styleTargets?.boxShadow) props.push("shadow");
        return props.length > 0 ? `style mismatch (${props.join(", ")})` : "style mismatch";
      }
      case "a11y":
        return node.a11yTargets?.role
          ? `missing/incorrect role: ${node.a11yTargets.role}`
          : "a11y target mismatch";
      case "perceptual":
        return "visual fidelity mismatch";
      default:
        return "unknown mismatch";
    }
  }
}
