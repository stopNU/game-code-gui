import type { StageName } from '../types/stage-result.js';

export interface RetryPolicy {
  /** Per-stage retry budget. */
  perStage: number;
  /** Total retry budget across all stages. */
  total: number;
  /** Minimum acceptable score per stage; below this triggers retry. */
  scoreThreshold: number;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  perStage: 3,
  total: 8,
  scoreThreshold: 0.6,
};

export class RetryBudget {
  private remaining: number;
  private perStageUsed: Map<StageName, number> = new Map();

  constructor(private readonly policy: RetryPolicy) {
    this.remaining = policy.total;
  }

  canRetry(stage: StageName): boolean {
    if (this.remaining <= 0) return false;
    const used = this.perStageUsed.get(stage) ?? 0;
    return used < this.policy.perStage;
  }

  consume(stage: StageName): void {
    this.remaining -= 1;
    this.perStageUsed.set(stage, (this.perStageUsed.get(stage) ?? 0) + 1);
  }

  retriesFor(stage: StageName): number {
    return this.perStageUsed.get(stage) ?? 0;
  }

  shouldRetry(stage: StageName, score: number): boolean {
    return score < this.policy.scoreThreshold && this.canRetry(stage);
  }
}
