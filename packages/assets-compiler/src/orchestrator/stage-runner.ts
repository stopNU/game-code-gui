import type { StageName, StageResult, StageIssue } from '../types/stage-result.js';
import type { AssetGraph } from './asset-graph.js';
import { RetryBudget } from './retry-policy.js';

export interface StageContext {
  graph: AssetGraph;
  signal?: AbortSignal;
}

export interface Stage<TIn, TOut> {
  name: StageName;
  run(input: TIn, ctx: StageContext): Promise<{ output: TOut; score: number; issues?: StageIssue[] }>;
}

export interface StageRunOptions {
  budget: RetryBudget;
  signal?: AbortSignal;
  onEvent?: (evt: StageEvent) => void;
}

export type StageEvent =
  | { type: 'stage-start'; stage: StageName; attempt: number }
  | { type: 'stage-result'; stage: StageName; result: StageResult }
  | { type: 'stage-retry'; stage: StageName; reason: string };

export async function runStage<TIn, TOut>(
  stage: Stage<TIn, TOut>,
  input: TIn,
  graph: AssetGraph,
  opts: StageRunOptions,
): Promise<{ result: StageResult; output: TOut }> {
  const issues: StageIssue[] = [];
  let lastOutput: TOut | undefined;
  let lastScore = 0;
  let attempt = 0;
  const startedAt = Date.now();

  // First attempt + up to N retries.
  while (true) {
    if (opts.signal?.aborted) {
      throw new DOMException('aborted', 'AbortError');
    }
    attempt += 1;
    opts.onEvent?.({ type: 'stage-start', stage: stage.name, attempt });

    const t0 = Date.now();
    let stageIssues: StageIssue[] = [];
    let score = 0;
    let output: TOut | undefined;
    try {
      const ran = await stage.run(input, { graph, ...(opts.signal ? { signal: opts.signal } : {}) });
      output = ran.output;
      score = ran.score;
      stageIssues = ran.issues ?? [];
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      stageIssues = [{ severity: 'error', message }];
      score = 0;
    }

    issues.push(...stageIssues);
    lastOutput = output;
    lastScore = score;

    const hasErrors = stageIssues.some((i) => i.severity === 'error');
    const shouldRetry = (hasErrors || opts.budget.shouldRetry(stage.name, score));

    if (!shouldRetry) {
      const result: StageResult = {
        stage: stage.name,
        ok: !hasErrors && score >= 0,
        score,
        issues,
        retries: opts.budget.retriesFor(stage.name),
        durationMs: Date.now() - startedAt,
      };
      opts.onEvent?.({ type: 'stage-result', stage: stage.name, result });
      if (lastOutput === undefined) {
        // Stage failed and produced no output; surface as a thrown error.
        throw new Error(
          `Stage ${stage.name} failed: ${stageIssues.map((i) => i.message).join('; ') || 'no output'}`,
        );
      }
      return { result, output: lastOutput };
    }

    if (!opts.budget.canRetry(stage.name)) {
      const result: StageResult = {
        stage: stage.name,
        ok: false,
        score,
        issues,
        retries: opts.budget.retriesFor(stage.name),
        durationMs: Date.now() - startedAt,
      };
      opts.onEvent?.({ type: 'stage-result', stage: stage.name, result });
      throw new Error(`Stage ${stage.name} exhausted retries (last score ${score.toFixed(2)})`);
    }

    opts.budget.consume(stage.name);
    opts.onEvent?.({
      type: 'stage-retry',
      stage: stage.name,
      reason: hasErrors
        ? `errors: ${stageIssues.map((i) => i.message).join('; ')}`
        : `score ${score.toFixed(2)} below threshold`,
    });
    void t0;
  }
}
