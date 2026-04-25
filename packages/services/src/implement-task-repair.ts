import { join } from 'path';
import { readFile } from 'fs/promises';
import { runEvals, type EvalDataset, type EvalLayerName, type EvalReport } from '@agent-harness/evals';
import { runAgentLoop, type AgentConfig, type AgentContext, type TaskPlan, type TaskResult, type TaskState } from '@agent-harness/core';
import { runTypeCheck } from '@agent-harness/game-adapter';
import { ALL_TOOLS } from '@agent-harness/tools';
import { BUNDLED_EVAL_DATASET, buildRepairTask, mergeTokenBreakdowns, withTokenBreakdown } from './implement-task-shared.js';

/**
 * Run typecheck after the agent loop; if errors are found, give the agent one
 * focused fix pass (max 15 iterations, 40k token budget, project+code tools only).
 * Returns a merged TaskResult reflecting both passes.
 */
export async function verifyAndRepair(
  projectPath: string,
  task: TaskState,
  plan: TaskPlan,
  result: TaskResult,
  agentConfig: AgentConfig,
  signal?: AbortSignal,
  onProgress?: (msg: string) => void,
  onText?: (delta: string) => void,
): Promise<TaskResult> {
  const check = await runTypeCheck(projectPath);
  const typeCheckedResult = check.success || check.errorCount === 0
    ? result
    : await runTypecheckFixPass(projectPath, task, result, agentConfig, signal, onProgress, onText, check.errorCount, check.errors);

  if (!typeCheckedResult.success) {
    return typeCheckedResult;
  }

  return runEvalRepairPass(projectPath, task, plan, typeCheckedResult, agentConfig, signal, onProgress, onText);
}

async function runTypecheckFixPass(
  projectPath: string,
  task: TaskState,
  result: TaskResult,
  agentConfig: AgentConfig,
  signal: AbortSignal | undefined,
  onProgress: ((msg: string) => void) | undefined,
  onText: ((delta: string) => void) | undefined,
  errorCount: number,
  errors: string[],
): Promise<TaskResult> {
  onProgress?.(`typecheck: ${errorCount} error(s) - running fix pass`);

  const errorBlock = errors.join('\n');
  const fixBrief =
    `TypeScript typecheck found ${errorCount} error(s) after your implementation.\n`
    + `Fix all type errors without changing game logic or design:\n\n${errorBlock}`;

  const fixTools = ALL_TOOLS.filter((tool) => ['project', 'code'].includes(tool.group));
  const fixCtx: AgentContext = {
    config: {
      ...agentConfig,
      toolGroups: ['project', 'code'],
      systemPrompt: agentConfig.systemPrompt,
    },
    task: buildRepairTask(task, fixBrief, result.filesModified),
    memory: [],
    conversationHistory: [],
    traceId: `${task.id}-fix`,
    iterationCount: 0,
    tokenBudget: 40000,
    tokenUsed: 0,
  };

  const fixResult = withTokenBreakdown(await runAgentLoop(
    fixCtx,
    {
      maxIterations: 15,
      retryPolicy: {
        maxRetries: 2,
        baseDelayMs: 1000,
        maxDelayMs: 15000,
        backoffMultiplier: 2,
        retryableErrors: ['overloaded_error', 'rate_limit_error'],
      },
      ...(signal !== undefined ? { signal } : {}),
      onToolCall: ({ name }) => onProgress?.(`[fix] ${name}`),
      ...(onText !== undefined ? { onText } : {}),
    },
    { tools: fixTools },
  ), 'typecheck-fix');

  const recheck = await runTypeCheck(projectPath);
  const tokenBreakdown = mergeTokenBreakdowns(result.tokenBreakdown, fixResult.tokenBreakdown);

  return {
    success: recheck.success,
    summary: recheck.success
      ? `${result.summary} (fix pass resolved ${errorCount} type error(s))`
      : `${result.summary} | Fix pass: ${recheck.errorCount} type error(s) remain`,
    filesModified: [...new Set([...result.filesModified, ...fixResult.filesModified])],
    toolCallCount: result.toolCallCount + fixResult.toolCallCount,
    tokensUsed: {
      input: result.tokensUsed.input + fixResult.tokensUsed.input,
      output: result.tokensUsed.output + fixResult.tokensUsed.output,
      cached: result.tokensUsed.cached + fixResult.tokensUsed.cached,
    },
    ...(tokenBreakdown !== undefined ? { tokenBreakdown } : {}),
  };
}

async function runEvalRepairPass(
  projectPath: string,
  task: TaskState,
  plan: TaskPlan,
  result: TaskResult,
  agentConfig: AgentConfig,
  signal?: AbortSignal,
  onProgress?: (msg: string) => void,
  onText?: (delta: string) => void,
): Promise<TaskResult> {
  const layers = determineEvalLayers(task);
  if (layers.length === 0) {
    return result;
  }

  onProgress?.(`eval: running ${layers.join(', ')} checks`);
  const report = await runSelectedEvals(projectPath, layers);
  const evalScores = summarizeEvalScores(report);
  const failures = report.scores.filter((score) => !score.passed);

  if (failures.length === 0) {
    return {
      ...result,
      ...(Object.keys(evalScores).length > 0 ? { evalScores } : {}),
      summary: `${result.summary} | Automated evals passed (${layers.join(', ')})`,
    };
  }

  onProgress?.(`eval: ${failures.length} failing scenario(s) - running repair pass`);

  const fixTools = ALL_TOOLS.filter((tool) => ['project', 'code', 'npm'].includes(tool.group));
  const fixCtx: AgentContext = {
    config: {
      ...agentConfig,
      toolGroups: ['project', 'code', 'npm'],
      systemPrompt: agentConfig.systemPrompt,
    },
    task: buildRepairTask(task, buildEvalFeedbackBrief(task, plan, report), result.filesModified),
    memory: [],
    conversationHistory: [],
    traceId: `${task.id}-eval-fix`,
    iterationCount: 0,
    tokenBudget: 50000,
    tokenUsed: 0,
  };

  const fixResult = withTokenBreakdown(await runAgentLoop(
    fixCtx,
    {
      maxIterations: 20,
      retryPolicy: {
        maxRetries: 2,
        baseDelayMs: 1000,
        maxDelayMs: 15000,
        backoffMultiplier: 2,
        retryableErrors: ['overloaded_error', 'rate_limit_error'],
      },
      ...(signal !== undefined ? { signal } : {}),
      onToolCall: ({ name }) => onProgress?.(`[eval-fix] ${name}`),
      ...(onText !== undefined ? { onText } : {}),
    },
    { tools: fixTools },
  ), 'eval-fix');

  const rerunReport = await runSelectedEvals(projectPath, layers);
  const rerunEvalScores = summarizeEvalScores(rerunReport);
  const remainingFailures = rerunReport.scores.filter((score) => !score.passed);
  const tokenBreakdown = mergeTokenBreakdowns(result.tokenBreakdown, fixResult.tokenBreakdown);
  const outcome = finalizeEvalRepairOutcome(result.summary, fixResult.success, failures.length, rerunReport);

  return {
    success: outcome.success,
    summary: outcome.summary,
    filesModified: [...new Set([...result.filesModified, ...fixResult.filesModified])],
    toolCallCount: result.toolCallCount + fixResult.toolCallCount,
    tokensUsed: {
      input: result.tokensUsed.input + fixResult.tokensUsed.input,
      output: result.tokensUsed.output + fixResult.tokensUsed.output,
      cached: result.tokensUsed.cached + fixResult.tokensUsed.cached,
    },
    ...(tokenBreakdown !== undefined ? { tokenBreakdown } : {}),
    ...(Object.keys(rerunEvalScores).length > 0 ? { evalScores: rerunEvalScores } : {}),
  };
}

export function finalizeEvalRepairOutcome(
  originalSummary: string,
  repairPassSucceeded: boolean,
  repairedFailureCount: number,
  rerunReport: EvalReport,
): Pick<TaskResult, 'success' | 'summary'> {
  const remainingFailures = rerunReport.scores.filter((score) => !score.passed);
  if (remainingFailures.length === 0) {
    return {
      success: repairPassSucceeded,
      summary: `${originalSummary} | Eval repair pass resolved ${repairedFailureCount} scenario(s)`,
    };
  }

  const failureSummary = summarizeEvalFailures(rerunReport);
  if (!repairPassSucceeded) {
    return {
      success: false,
      summary: `${originalSummary} | Eval repair incomplete: ${failureSummary}`,
    };
  }

  return {
    success: true,
    summary: `${originalSummary} | Warning: automated evals still report project-level failures after this task: ${failureSummary}`,
  };
}

function determineEvalLayers(task: TaskState): EvalLayerName[] {
  const layers = new Set<EvalLayerName>(['build']);

  if (
    task.role === 'gameplay'
    || task.role === 'integration-verifier'
  ) {
    layers.add('functional');
  }

  layers.add('data');
  layers.add('systems');

  return [...layers];
}

async function runSelectedEvals(projectPath: string, layers: EvalLayerName[]): Promise<EvalReport> {
  const dataset = JSON.parse(await readFile(BUNDLED_EVAL_DATASET, 'utf8')) as EvalDataset;
  return runEvals({
    projectPath,
    dataset,
    layers,
    reportOutputDir: join(projectPath, 'harness', 'baselines'),
  });
}

function summarizeEvalScores(report: EvalReport): Partial<Record<EvalLayerName, number>> {
  const totals = new Map<EvalLayerName, { total: number; count: number }>();
  for (const score of report.scores) {
    const current = totals.get(score.layer) ?? { total: 0, count: 0 };
    current.total += score.ratio * 10;
    current.count += 1;
    totals.set(score.layer, current);
  }

  const summary: Partial<Record<EvalLayerName, number>> = {};
  for (const [layer, value] of totals.entries()) {
    summary[layer] = value.total / value.count;
  }
  return summary;
}

function buildEvalFeedbackBrief(task: TaskState, plan: TaskPlan, report: EvalReport): string {
  const failureSummary = summarizeEvalFailures(report);
  return [
    `The implementation for task "${task.title}" failed automated evals.`,
    'Use the failing scenarios below to repair the code without regressing existing behavior.',
    '',
    `Original task: ${task.description}`,
    '',
    `Game brief: ${plan.gameBrief}`,
    '',
    'Eval failures:',
    failureSummary,
  ].join('\n');
}

function summarizeEvalFailures(report: EvalReport): string {
  return report.scores
    .filter((score) => !score.passed)
    .map((score) => {
      const status = score.inconclusive ? 'inconclusive' : 'failed';
      const dimensionSummary = score.dimensions
        .filter((dimension) => dimension.score < dimension.maxScore)
        .map((dimension) => `${dimension.name}: ${dimension.rationale ?? `${dimension.score}/${dimension.maxScore}`}`)
        .join('; ');
      return `- [${score.layer}] ${score.scenarioId} (${status}) ${score.summary ?? (dimensionSummary || `${(score.ratio * 100).toFixed(0)}%`)}`;
    })
    .join('\n');
}
