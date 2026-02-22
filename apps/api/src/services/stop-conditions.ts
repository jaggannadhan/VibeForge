/**
 * StopConditions — evaluates whether the iteration loop should terminate
 * based on several criteria: max iterations, plateau, consecutive rejections,
 * and optional time budget.
 */

export interface StopConfig {
  maxIterations: number;
  plateauWindow: number;
  plateauThreshold: number;
  maxConsecutiveRejections: number;
  timeBudgetMs?: number;
}

export interface StopResult {
  stop: boolean;
  reason: string;
}

const DEFAULT_CONFIG: StopConfig = {
  maxIterations: 12,
  plateauWindow: 3,
  plateauThreshold: 0.01,
  maxConsecutiveRejections: 3,
  timeBudgetMs: 15 * 60 * 1000, // 15 minutes
};

export class StopConditions {
  private readonly config: StopConfig;

  constructor(config?: Partial<StopConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Check whether the iteration loop should stop.
   */
  shouldStop(state: {
    iteration: number;
    acceptedScoreHistory: number[];
    consecutiveRejections: number;
    startTime: number;
  }): StopResult {
    // 1. Max iterations reached
    if (state.iteration >= this.config.maxIterations - 1) {
      return { stop: true, reason: "max_iterations" };
    }

    // 2. Consecutive rejections
    if (state.consecutiveRejections >= this.config.maxConsecutiveRejections) {
      return {
        stop: true,
        reason: `regression_limit (${state.consecutiveRejections} consecutive rejections)`,
      };
    }

    // 3. Plateau — check if last N accepted scores show minimal improvement
    const history = state.acceptedScoreHistory;
    if (history.length >= this.config.plateauWindow) {
      const recentScores = history.slice(-this.config.plateauWindow);
      const minRecent = Math.min(...recentScores);
      const maxRecent = Math.max(...recentScores);
      const range = maxRecent - minRecent;

      if (range < this.config.plateauThreshold) {
        return {
          stop: true,
          reason: `plateau (${this.config.plateauWindow} accepted iterations with < ${this.config.plateauThreshold} improvement)`,
        };
      }
    }

    // 4. Time budget
    if (this.config.timeBudgetMs) {
      const elapsed = Date.now() - state.startTime;
      if (elapsed > this.config.timeBudgetMs) {
        const minutes = Math.round(elapsed / 60_000);
        return {
          stop: true,
          reason: `time_budget (${minutes} min exceeded)`,
        };
      }
    }

    return { stop: false, reason: "" };
  }

  getConfig(): StopConfig {
    return { ...this.config };
  }
}
