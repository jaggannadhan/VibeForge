/**
 * Scorekeeper — tracks the best score seen so far and makes accept/reject
 * decisions for each iteration based on whether the candidate score improves
 * on the best by at least epsilon.
 */

export interface ScorekeeperState {
  bestScore: number;
  bestIterationIndex: number;
  epsilon: number;
}

export interface ScorekeeperDecision {
  accepted: boolean;
  reason: "improved" | "regression" | "no_improvement";
  bestScore: number;
  bestIterationIndex: number;
}

export class Scorekeeper {
  private bestScore = -Infinity;
  private bestIterationIndex = -1;
  private readonly epsilon: number;

  constructor(epsilon = 0.01) {
    this.epsilon = epsilon;
  }

  /**
   * Evaluate a candidate score for a given iteration.
   *
   * - Candidate >= best + epsilon → accept (improved)
   * - Candidate < best - epsilon  → reject (regression)
   * - Otherwise                   → reject (no meaningful improvement)
   *
   * On the very first call (bestScore === -Infinity), the iteration is always
   * accepted so we have a baseline.
   */
  decide(candidateScore: number, iterationIndex: number): ScorekeeperDecision {
    // First iteration is always accepted as the initial baseline
    if (this.bestScore === -Infinity) {
      this.bestScore = candidateScore;
      this.bestIterationIndex = iterationIndex;
      return {
        accepted: true,
        reason: "improved",
        bestScore: this.bestScore,
        bestIterationIndex: this.bestIterationIndex,
      };
    }

    if (candidateScore >= this.bestScore + this.epsilon) {
      // Meaningful improvement — accept
      this.bestScore = candidateScore;
      this.bestIterationIndex = iterationIndex;
      return {
        accepted: true,
        reason: "improved",
        bestScore: this.bestScore,
        bestIterationIndex: this.bestIterationIndex,
      };
    }

    if (candidateScore < this.bestScore - this.epsilon) {
      // Regression — reject
      return {
        accepted: false,
        reason: "regression",
        bestScore: this.bestScore,
        bestIterationIndex: this.bestIterationIndex,
      };
    }

    // No meaningful change — reject
    return {
      accepted: false,
      reason: "no_improvement",
      bestScore: this.bestScore,
      bestIterationIndex: this.bestIterationIndex,
    };
  }

  getState(): ScorekeeperState {
    return {
      bestScore: this.bestScore,
      bestIterationIndex: this.bestIterationIndex,
      epsilon: this.epsilon,
    };
  }
}
