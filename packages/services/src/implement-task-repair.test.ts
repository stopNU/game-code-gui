import { describe, expect, it } from 'vitest';
import type { EvalReport } from '@agent-harness/evals';
import { finalizeEvalRepairOutcome } from './implement-task-repair.js';

function makeEvalReport(passed: boolean): EvalReport {
  return {
    reportId: 'report-1',
    datasetId: 'test-dataset',
    runAt: '2026-04-19T00:00:00.000Z',
    projectPath: 'D:/tmp/project',
    scores: [
      {
        layer: 'systems',
        scenarioId: 'systems-001',
        passed,
        inconclusive: false,
        ratio: passed ? 1 : 0.5,
        summary: passed ? 'ok' : 'scene validator blocked by existing parse warning',
        totalScore: passed ? 10 : 5,
        maxScore: 10,
        durationMs: 1,
        runAt: '2026-04-19T00:00:00.000Z',
        dimensions: [],
      },
    ],
    summary: {
      total: 1,
      passed: passed ? 1 : 0,
      failed: passed ? 0 : 1,
      inconclusive: 0,
      passRate: passed ? 1 : 0,
      avgScore: passed ? 1 : 0.5,
      byLayer: {
        systems: {
          total: 1,
          passed: passed ? 1 : 0,
          avgScore: passed ? 1 : 0.5,
        },
      },
    },
  };
}

describe('finalizeEvalRepairOutcome', () => {
  it('keeps the task successful when only project-level eval failures remain', () => {
    const outcome = finalizeEvalRepairOutcome('Implemented task', true, 1, makeEvalReport(false));

    expect(outcome.success).toBe(true);
    expect(outcome.summary).toContain('Warning: automated evals still report project-level failures');
  });

  it('fails the task when the eval repair pass itself fails', () => {
    const outcome = finalizeEvalRepairOutcome('Implemented task', false, 1, makeEvalReport(false));

    expect(outcome.success).toBe(false);
    expect(outcome.summary).toContain('Eval repair incomplete');
  });

  it('reports success when eval repair clears all failures', () => {
    const outcome = finalizeEvalRepairOutcome('Implemented task', true, 1, makeEvalReport(true));

    expect(outcome.success).toBe(true);
    expect(outcome.summary).toContain('Eval repair pass resolved 1 scenario(s)');
  });
});
