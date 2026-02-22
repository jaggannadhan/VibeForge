/**
 * LockManager — tracks nodes that have converged (met their targets)
 * and prevents the LLM from modifying them in subsequent iterations.
 *
 * Once a node is locked, it stays locked for the duration of the run.
 *
 * Current implementation uses aggregate dimension scores as a proxy
 * for per-node convergence. When per-node scoring becomes available,
 * the updateLocks method can accept granular data instead.
 */

import type { IRNode } from "@vibe-studio/shared";

export interface LockThresholds {
  /** Maximum bbox error in px to consider a node locked (default 6) */
  bboxLockThresholdPx: number;
  /** Maximum style error (0-1) to consider a node locked (default 0.15) */
  styleLockThreshold: number;
}

const DEFAULT_THRESHOLDS: LockThresholds = {
  bboxLockThresholdPx: 6,
  styleLockThreshold: 0.15,
};

export class LockManager {
  private readonly thresholds: LockThresholds;
  private readonly lockedNodeIds = new Set<string>();

  constructor(thresholds?: Partial<LockThresholds>) {
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...thresholds };
  }

  /**
   * Update lock state based on per-node error data.
   *
   * When per-node scores are available, pass them directly:
   *   perNodeErrors: Map<nodeId, { bboxError: number; styleError: number }>
   *
   * When only aggregate scores are available, use updateLocksFromAggregate() instead.
   */
  updateLocks(
    perNodeErrors: Map<string, { bboxError: number; styleError: number }>
  ): void {
    for (const [nodeId, errors] of perNodeErrors) {
      if (
        errors.bboxError <= this.thresholds.bboxLockThresholdPx &&
        errors.styleError <= this.thresholds.styleLockThreshold
      ) {
        this.lockedNodeIds.add(nodeId);
      }
    }
  }

  /**
   * Heuristic lock based on aggregate dimension scores.
   *
   * When aggregate layout and style scores are high enough, lock critical
   * nodes that have explicit layout+style targets — these are most likely
   * to have already converged.
   *
   * This is a proxy until per-node scoring is available.
   */
  updateLocksFromAggregate(
    aggregateScore: { layout: number; style: number },
    irNodes: IRNode[]
  ): void {
    // Only lock when aggregate scores are reasonably high
    const layoutError = 1 - aggregateScore.layout;
    const styleError = 1 - aggregateScore.style;

    // Convert threshold to 0-1 scale for aggregate comparison
    // bboxLockThresholdPx=6 → allow ~0.15 error at aggregate level
    const layoutThreshold = this.thresholds.bboxLockThresholdPx / 40; // ~0.15
    const styleThreshold = this.thresholds.styleLockThreshold;

    if (layoutError > layoutThreshold || styleError > styleThreshold) {
      return; // Aggregate scores too low to lock anything
    }

    // Lock critical nodes that have explicit bbox + style targets
    for (const node of irNodes) {
      if (this.lockedNodeIds.has(node.nodeId)) continue;
      if (node.matchImportance !== "critical") continue;

      const hasBbox = !!node.layoutTargets?.bbox;
      const hasStyle = Object.values(node.styleTargets || {}).some(
        (v) => v !== undefined
      );

      if (hasBbox && hasStyle) {
        this.lockedNodeIds.add(node.nodeId);
      }
    }
  }

  getLockedNodeIds(): Set<string> {
    return new Set(this.lockedNodeIds);
  }

  isLocked(nodeId: string): boolean {
    return this.lockedNodeIds.has(nodeId);
  }

  getLockedCount(): number {
    return this.lockedNodeIds.size;
  }
}
