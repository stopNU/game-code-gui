import { fileURLToPath } from 'url';
import {
  runAgentLoop,
  runCodexLoop,
  runClaudeCodeLoop,
  Tracer,
  MemoryStore,
  FULL_DEV_POLICY,
  defaultAgentConfig,
  getModelProvider,
  getSystemPrompt,
  detectNPCs,
  ROLE_TOKEN_BUDGET,
  type AgentContext,
  type AgentRole,
  type AgentConfig,
  type TaskPlan,
  type TaskState,
  type TaskResult,
  type ClaudeMessage,
  type InputOutputTokens,
  type ArchitectureContract,
  type AdvancedSharedContext,
  type BudgetExhaustedDecision,
  type TokenUsageBreakdownEntry,
  type TokenUsagePhase,
  type RuntimeReconciliationReport,
} from '@agent-harness/core';
import { runEvals, type EvalDataset, type EvalLayerName, type EvalReport } from '@agent-harness/evals';
import { ALL_TOOLS } from '@agent-harness/tools';
import { runTypeCheck, writeRuntimeManifest } from '@agent-harness/game-adapter';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';

const BUNDLED_EVAL_DATASET = fileURLToPath(new URL('../../../../packages/evals/src/data/baseline-scenarios.json', import.meta.url));

interface SourceInjectionLimits {
  maxFiles: number;
  maxLines: number;
  maxDependencyFiles: number;
}
export interface ImplementTaskOptions {
  project: string;
  task?: string;
  resume?: boolean;
  mode?: 'simple' | 'advanced';
  concurrency?: number;
  model?: string;
  reconciliationReport?: string;
}

export interface ParallelRunOptions {
  concurrency?: number;
  taskMode?: 'simple' | 'advanced';
  signal?: AbortSignal;
  model?: string;
  reconciliationReport?: string;
  /** When set, only tasks belonging to this phase number are started. */
  phaseFilter?: number;
  onTaskStart?: (task: TaskState) => void;
  onTaskDone?: (task: TaskState, result: TaskResult) => void;
  onProgress?: (taskId: string, msg: string) => void;
  onText?: (taskId: string, delta: string) => void;
}

export interface ParallelRunResult {
  ranCount: number;
  failedCount: number;
}

const memoryWriteQueues = new Map<string, Promise<void>>();

function rolePrompt(role: AgentRole, _mode: string, task: TaskState): string {
  return getSystemPrompt(role, undefined, {
    hasNPCs: detectNPCs(task.title, task.description),
  });
}

/** Serialize writes to tasks.json so concurrent agents don't clobber each other. */
function makeWriteQueue(tasksPath: string): (plan: TaskPlan) => Promise<void> {
  let queue = Promise.resolve();
  return (plan: TaskPlan): Promise<void> => {
    queue = queue.then(() => writeFile(tasksPath, JSON.stringify(plan, null, 2), 'utf8'));
    return queue;
  };
}

/**
 * Core task executor — shared by the CLI command and the new-game auto-implement loop.
 * Returns the TaskResult (caller decides how to present it).
 *
 * @param persistPlan - Optional serialized write callback for parallel execution.
 *   When omitted, writes tasks.json directly. Pass a `makeWriteQueue` result when
 *   running multiple tasks concurrently to avoid interleaved writes.
 */
export async function runTask(
  projectPath: string,
  task: TaskState,
  plan: TaskPlan,
  onProgress?: (msg: string) => void,
  mode: 'simple' | 'advanced' = 'simple',
  onToolCallDetail?: (call: { name: string; input: Record<string, unknown> }) => void,
  onAgentMessage?: (message: ClaudeMessage) => void,
  onTokens?: (tokens: InputOutputTokens) => void,
  signal?: AbortSignal,
  onText?: (delta: string) => void,
  model?: string,
  persistPlan?: (plan: TaskPlan) => Promise<void>,
  onBudgetExhausted?: (used: number, budget: number, filesWritten: number) => Promise<BudgetExhaustedDecision>,
  reconciliationReportPath?: string,
): Promise<TaskResult> {
  const tasksPath = join(projectPath, 'harness', 'tasks.json');
  const memoryPath = join(projectPath, 'harness', 'memory.json');
  const persist = persistPlan ?? ((p: TaskPlan) => writeFile(tasksPath, JSON.stringify(p, null, 2), 'utf8'));

  // Load memory
  const memoryStore = await loadMemoryStore(projectPath, memoryPath);
  const dependencySummaries = memoryStore.dependencySummaries(task).map((entry) => entry.value);
  task.context.dependencySummaries = dependencySummaries;
  task.context.memoryKeys = memoryStore.forTask(task).map((entry) => entry.key);
  const memory = memoryStore.forTask(task);

  // Populate context fields
  task.status = 'in-progress';
  task.updatedAt = new Date().toISOString();
  task.context.projectPath = projectPath;

  // Reference the game spec by path so the agent reads it on demand instead of receiving the full
  // content on every turn. Fall back to inlining the brief only when game-spec.md doesn't exist
  // and the brief is short enough not to bloat the prompt.
  try {
    await readFile(join(projectPath, 'docs', 'game-spec.md'), 'utf8');
    task.context.gameSpecPath = 'docs/game-spec.md';
  } catch {
    if (plan.gameBrief.length <= 600) {
      task.context.gameSpec = plan.gameBrief;
    }
  }

  if (task.role === 'asset') {
    const canvasSize = await readCanvasSize(projectPath);
    task.context.canvasWidth = canvasSize.width;
    task.context.canvasHeight = canvasSize.height;
    task.context.visualStyle = buildVisualStyleSummary(plan);
    task.context.plannedEntities = plan.entities;
    task.context.plannedAssets = plan.assets;
    task.context.scenesNeedingBackgrounds = inferScenesNeedingBackgrounds(plan.scenes);
  }

  if (mode === 'advanced' || task.role === 'gameplay' || task.role === 'systems' || task.role === 'balance') {
    const architecturePath = join(projectPath, 'docs', 'architecture.json');
    try {
      const architecture = JSON.parse(await readFile(architecturePath, 'utf8')) as ArchitectureContract;
      task.context.architecturePath = 'docs/architecture.json';
      task.context.architectureContract = architecture;
      task.context.architectureNotes = summarizeArchitectureForTask(task, architecture);
      if (!task.context.relevantFiles.includes('docs/architecture.json')) {
        task.context.relevantFiles = [...task.context.relevantFiles, 'docs/architecture.json'];
      }
    } catch {
      // Advanced scaffolds should provide this file, but keep execution resilient when absent.
    }
  }

  if (mode === 'advanced') {
    const advancedContextPath = join(projectPath, 'docs', 'advanced-context.json');
    try {
      const advancedSharedContext = JSON.parse(
        await readFile(advancedContextPath, 'utf8'),
      ) as AdvancedSharedContext;
      task.context.advancedContextPath = 'docs/advanced-context.json';
      task.context.advancedSharedContext = advancedSharedContext;
      if (!task.context.relevantFiles.includes('docs/advanced-context.json')) {
        task.context.relevantFiles = [...task.context.relevantFiles, 'docs/advanced-context.json'];
      }
    } catch {
      // Older advanced projects may not have this file yet.
    }
  }

  try {
    const runtimeManifest = await writeRuntimeManifest(projectPath);
    task.context.runtimeManifestPath = 'harness/runtime-manifest.json';
    task.context.runtimeManifest = runtimeManifest;
    if (!task.context.relevantFiles.includes('harness/runtime-manifest.json')) {
      task.context.relevantFiles = [...task.context.relevantFiles, 'harness/runtime-manifest.json'];
    }
  } catch {
    // Older projects may not have a runtime manifest yet.
  }

  // Pre-read source files: inject small files (≤ SMALL_FILE_LINES) in full; record line counts for
  // larger files so the agent knows they exist without bloating the prompt with full contents.
  // Sources: (1) task.context.relevantFiles, (2) files created by transitive dependency tasks.
  const resolvedReconciliationReportPath = await resolveReconciliationReportPath(projectPath, reconciliationReportPath);
  if (resolvedReconciliationReportPath !== undefined) {
    try {
      const reconciliationReport = JSON.parse(
        await readFile(join(projectPath, resolvedReconciliationReportPath), 'utf8'),
      ) as RuntimeReconciliationReport;
      task.context.reconciliationReportPath = resolvedReconciliationReportPath;
      task.context.reconciliationReport = reconciliationReport;
      if (!task.context.relevantFiles.includes(resolvedReconciliationReportPath)) {
        task.context.relevantFiles = [...task.context.relevantFiles, resolvedReconciliationReportPath];
      }
    } catch {
      // Ignore malformed reports so task execution can continue.
    }
  }

  const SMALL_FILE_LINES = 60;
  const injectionLimits = getSourceInjectionLimits(task.role);

  const allTasks = plan.phases.flatMap((ph) => ph.tasks);
  const depFiles = getTransitiveDependencyFiles(task.id, allTasks, projectPath);

  const relevantSourceFiles = task.context.relevantFiles.filter((f) => f.endsWith('.ts') || f.endsWith('.js'));
  const dependencySourceFiles = depFiles.slice(0, injectionLimits.maxDependencyFiles);
  const candidatePaths = new Set<string>([
    ...relevantSourceFiles,
    ...dependencySourceFiles,
  ]);

  const contents: Record<string, string> = {};
  const fileIndex: Record<string, number> = {};
  await Promise.all(
    [...candidatePaths].slice(0, injectionLimits.maxFiles).map(async (relPath) => {
      try {
        const absPath = join(projectPath, relPath);
        const raw = await readFile(absPath, 'utf8');
        const lineCount = raw.split('\n').length;
        if (lineCount <= SMALL_FILE_LINES) {
          contents[relPath] = raw;
        } else {
          fileIndex[relPath] = lineCount;
        }
      } catch {
        // File may not exist yet — skip silently.
      }
    }),
  );
  if (Object.keys(contents).length > 0) {
    task.context.relevantFileContents = contents;
  }
  if (Object.keys(fileIndex).length > 0) {
    task.context.relevantFileIndex = fileIndex;
  }

  // Persist in-progress status before running
  await persist(plan);

  const tracer = new Tracer(task.id, task.role);
  const agentConfig: AgentConfig = {
    ...defaultAgentConfig(task.role, rolePrompt(task.role, mode, task)),
    toolGroups: task.toolsAllowed,
    permissions: FULL_DEV_POLICY,
    ...(model !== undefined ? { model } : {}),
  };

  const ctx: AgentContext = {
    config: agentConfig,
    task,
    memory,
    conversationHistory: [],
    traceId: tracer.traceId,
    iterationCount: 0,
    tokenBudget: ROLE_TOKEN_BUDGET[task.role] ?? 200_000,
    tokenUsed: 0,
  };

  const allowedTools = ALL_TOOLS.filter((t) => task.toolsAllowed.includes(t.group));
  let toolCallCount = 0;
  const provider = getModelProvider(agentConfig.model);
  const loopOptions = {
    maxIterations: 30,
    retryPolicy: {
      maxRetries: 6,
      baseDelayMs: 5000,
      maxDelayMs: 120000,
      backoffMultiplier: 2,
      retryableErrors: ['overloaded_error', 'rate_limit_error'],
    },
    ...(signal !== undefined ? { signal } : {}),
    onToolCall: ({ name, input }: { name: string; input: Record<string, unknown> }) => {
      toolCallCount++;
      onProgress?.(`[${toolCallCount}] ${name}`);
      onToolCallDetail?.({ name, input });
    },
    onMessage: (message: ClaudeMessage) => {
      onAgentMessage?.(message);
    },
    onTokens: (tokens: InputOutputTokens) => {
      onTokens?.(tokens);
    },
    ...(onText !== undefined ? { onText } : {}),
    ...(onBudgetExhausted !== undefined ? { onBudgetExhausted } : {}),
  };

  const rawResult = provider === 'openai-codex'
    ? await runCodexLoop(ctx, loopOptions)
    : provider === 'claude-code'
    ? await runClaudeCodeLoop(ctx, loopOptions)
    : await runAgentLoop(ctx, loopOptions, { tools: allowedTools });
  const result = withTokenBreakdown(rawResult, 'main');

  // Verify-and-fix: run typecheck and give the agent one more pass to fix errors.
  // Skipped for non-code roles (qa, evaluator) that don't produce TypeScript files.
  const codeRoles: AgentRole[] = [
    'gameplay',
    'systems',
    'integration-verifier',
    'asset',
    'balance',
    'designer',
  ];
  const finalResult = provider !== 'openai-codex' && provider !== 'claude-code' && codeRoles.includes(task.role)
    ? await verifyAndRepair(projectPath, task, plan, result, agentConfig, mode, signal, onProgress, onText)
    : result;

  task.status = finalResult.success ? 'complete' : 'failed';
  task.result = finalResult;
  task.completedAt = new Date().toISOString();
  task.updatedAt = task.completedAt;
  if (!finalResult.success) task.error = finalResult.summary;

  if (finalResult.success) {
    await persistTaskSummary(projectPath, memoryPath, task, finalResult);
  }

  await persist(plan);
  return finalResult;
}

async function loadMemoryStore(
  projectPath: string,
  memoryPath: string,
): Promise<MemoryStore> {
  try {
    const memFile: import('@agent-harness/core').MemoryFile = JSON.parse(
      await readFile(memoryPath, 'utf8'),
    ) as import('@agent-harness/core').MemoryFile;
    return MemoryStore.fromFile(memFile);
  } catch {
    return new MemoryStore(projectPath);
  }
}

async function resolveReconciliationReportPath(
  projectPath: string,
  reconciliationReportPath?: string,
): Promise<string | undefined> {
  const candidates = [
    reconciliationReportPath,
    'harness/runtime-reconciliation-report.json',
  ].filter((value): value is string => value !== undefined);

  for (const candidate of candidates) {
    const normalized = candidate.replace(/\\/g, '/');
    try {
      await readFile(join(projectPath, normalized), 'utf8');
      return normalized;
    } catch {
      // Keep searching for the first readable report.
    }
  }

  return undefined;
}

async function persistTaskSummary(
  projectPath: string,
  memoryPath: string,
  task: TaskState,
  result: TaskResult,
): Promise<void> {
  const priorQueue = memoryWriteQueues.get(memoryPath) ?? Promise.resolve();
  const nextQueue = priorQueue.then(async () => {
    const store = await loadMemoryStore(projectPath, memoryPath);
    store.setTaskSummary(task, result);
    await writeFile(memoryPath, JSON.stringify(store.toFile(), null, 2), 'utf8');
  });

  memoryWriteQueues.set(memoryPath, nextQueue.catch(() => undefined));
  await nextQueue;
}

function summarizeArchitectureForTask(task: TaskState, architecture: ArchitectureContract): string {
  const subsystemApi = task.context.subsystemId
    ? architecture.subsystemApis.find((api: ArchitectureContract['subsystemApis'][number]) => api.subsystemId === task.context.subsystemId)
    : undefined;
  const stateMachineSummary = architecture.stateMachines
    .map((machine: ArchitectureContract['stateMachines'][number]) => `${machine.id}: [${machine.states.join(', ')}]`)
    .join('; ');

  const lines = [
    `Event types: ${architecture.eventTypes.join(', ') || 'none'}`,
    `State machines: ${stateMachineSummary || 'none'}`,
  ];

  if (subsystemApi) {
    lines.push(
      `Subsystem API (${subsystemApi.subsystemId}): modules=${subsystemApi.modules.join(', ') || 'none'}; ` +
      `events=${subsystemApi.exposedEvents.join(', ') || 'none'}; ` +
      `contentLoader=${subsystemApi.contentLoaderMethods.join(', ') || 'none'}`,
    );
  }

  return lines.join('\n');
}

async function readCanvasSize(projectPath: string): Promise<{ width: number; height: number }> {
  const fallback = { width: 800, height: 600 };

  try {
    const configPath = join(projectPath, 'src', 'game', 'config.ts');
    const configSource = await readFile(configPath, 'utf8');
    const widthMatch = configSource.match(/export const GAME_WIDTH = (\d+);/);
    const heightMatch = configSource.match(/export const GAME_HEIGHT = (\d+);/);

    return {
      width: widthMatch ? Number(widthMatch[1]) : fallback.width,
      height: heightMatch ? Number(heightMatch[1]) : fallback.height,
    };
  } catch {
    return fallback;
  }
}

function buildVisualStyleSummary(plan: TaskPlan): string {
  return `${plan.genre} game. Brief/style direction: ${plan.gameBrief}`;
}

function inferScenesNeedingBackgrounds(scenes: string[]): string[] {
  return scenes.filter((scene) => !['BootScene', 'HudScene'].includes(scene));
}

/**
 * Run typecheck after the agent loop; if errors are found, give the agent one
 * focused fix pass (max 15 iterations, 40k token budget, project+code tools only).
 * Returns a merged TaskResult reflecting both passes.
 */
async function verifyAndRepair(
  projectPath: string,
  task: TaskState,
  plan: TaskPlan,
  result: TaskResult,
  agentConfig: AgentConfig,
  mode: 'simple' | 'advanced',
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

  return runEvalRepairPass(projectPath, task, plan, typeCheckedResult, agentConfig, mode, signal, onProgress, onText);
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
    `TypeScript typecheck found ${errorCount} error(s) after your implementation.\n` +
    `Fix all type errors without changing game logic or design:\n\n${errorBlock}`;

  const fixTools = ALL_TOOLS.filter((t) => ['project', 'code'].includes(t.group));

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

  // Re-check to see if the fix pass resolved the errors
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
  mode: 'simple' | 'advanced',
  signal?: AbortSignal,
  onProgress?: (msg: string) => void,
  onText?: (delta: string) => void,
): Promise<TaskResult> {
  const layers = determineEvalLayers(task, mode);
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

  return {
    success: fixResult.success && remainingFailures.length === 0,
    summary: remainingFailures.length === 0
      ? `${result.summary} | Eval repair pass resolved ${failures.length} scenario(s)`
      : `${result.summary} | Eval repair incomplete: ${summarizeEvalFailures(rerunReport)}`,
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

function determineEvalLayers(task: TaskState, mode: 'simple' | 'advanced'): EvalLayerName[] {
  const layers = new Set<EvalLayerName>(['build']);

  if (
    task.role === 'gameplay'
    || task.role === 'integration-verifier'
  ) {
    layers.add('functional');
  }

  if (
    mode === 'advanced'
    || task.role === 'systems'
    || task.role === 'integration-verifier'
    || task.role === 'balance'
  ) {
    layers.add('data');
    layers.add('systems');
  }

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

function getSourceInjectionLimits(role: AgentRole): SourceInjectionLimits {
  switch (role) {
    case 'integration-verifier':
      return { maxFiles: 6, maxLines: 250, maxDependencyFiles: 2 };
    case 'systems':
    case 'gameplay':
      return { maxFiles: 8, maxLines: 300, maxDependencyFiles: 3 };
    case 'balance':
      return { maxFiles: 6, maxLines: 250, maxDependencyFiles: 2 };
    default:
      return { maxFiles: 8, maxLines: 300, maxDependencyFiles: 2 };
  }
}

function buildRepairTask(
  task: TaskState,
  brief: string,
  filesModified: string[],
): TaskState {
  const narrowedRelevantFiles = [...new Set([
    ...filesModified,
    ...task.context.relevantFiles,
  ])];

  return {
    ...task,
    brief,
    context: {
      projectPath: task.context.projectPath,
      gameSpec: '',
      relevantFiles: narrowedRelevantFiles,
      memoryKeys: [],
      dependencySummaries: [],
      previousTaskSummaries: [],
      ...(task.context.subsystemId !== undefined ? { subsystemId: task.context.subsystemId } : {}),
      ...(task.context.dataSchemaRefs !== undefined ? { dataSchemaRefs: task.context.dataSchemaRefs } : {}),
      ...(task.context.architectureNotes !== undefined ? { architectureNotes: task.context.architectureNotes } : {}),
      ...(task.context.architecturePath !== undefined ? { architecturePath: task.context.architecturePath } : {}),
      ...(task.context.advancedContextPath !== undefined ? { advancedContextPath: task.context.advancedContextPath } : {}),
      ...(task.context.gameSpecPath !== undefined ? { gameSpecPath: task.context.gameSpecPath } : {}),
      ...(task.context.runtimeManifestPath !== undefined ? { runtimeManifestPath: task.context.runtimeManifestPath } : {}),
      ...(task.context.runtimeManifest !== undefined ? { runtimeManifest: task.context.runtimeManifest } : {}),
      ...(task.context.reconciliationReportPath !== undefined ? { reconciliationReportPath: task.context.reconciliationReportPath } : {}),
      ...(task.context.reconciliationReport !== undefined ? { reconciliationReport: task.context.reconciliationReport } : {}),
    },
  };
}

function withTokenBreakdown(result: TaskResult, phase: TokenUsagePhase): TaskResult {
  if (result.tokenBreakdown !== undefined) {
    return result;
  }

  return {
    ...result,
    tokenBreakdown: [{ phase, tokensUsed: result.tokensUsed }],
  };
}

function mergeTokenBreakdowns(
  left?: TokenUsageBreakdownEntry[],
  right?: TokenUsageBreakdownEntry[],
): TokenUsageBreakdownEntry[] | undefined {
  const merged = [...(left ?? []), ...(right ?? [])];
  return merged.length > 0 ? merged : undefined;
}

export function formatTokenCount(value: number): string {
  return value.toLocaleString();
}

export function formatTokenBreakdownLines(result: TaskResult): string[] {
  const entries = result.tokenBreakdown ?? [];
  if (entries.length === 0) {
    return [];
  }

  return entries.map(({ phase, tokensUsed }) => {
    const phaseLabel = phase === 'main'
      ? 'main'
      : phase === 'typecheck-fix'
        ? 'typecheck-fix'
        : 'eval-fix';
    return `${phaseLabel}: in ${formatTokenCount(tokensUsed.input)}, out ${formatTokenCount(tokensUsed.output)}, cached ${formatTokenCount(tokensUsed.cached)}`;
  });
}

/**
 * Parallel task scheduler with dependency-aware DAG execution.
 *
 * Runs up to `concurrency` tasks simultaneously. A task is eligible when:
 *   - Its status is not complete / blocked / failed
 *   - It is not currently running
 *   - All task IDs listed in `task.dependencies` have status === 'complete'
 *
 * When a task fails, only its transitive dependents are marked 'blocked'.
 * Tasks with no dependency on the failed task continue to run unaffected.
 *
 * Writes to tasks.json are serialized through a write queue so concurrent
 * agents never clobber each other.
 */
export async function runTasksParallel(
  projectPath: string,
  plan: TaskPlan,
  opts: ParallelRunOptions = {},
): Promise<ParallelRunResult> {
  const { concurrency = 3, taskMode = 'simple', signal, model } = opts;
  const tasksPath = join(projectPath, 'harness', 'tasks.json');
  const persist = makeWriteQueue(tasksPath);

  const allTasksList = (): TaskState[] => plan.phases.flatMap((p) => p.tasks);
  // When phaseFilter is set, only tasks from that phase are started/awaited.
  // completedIds is still seeded from all tasks so cross-phase dependencies resolve correctly.
  const phaseTasks = (): TaskState[] =>
    opts.phaseFilter !== undefined
      ? allTasksList().filter((t) => t.phase === opts.phaseFilter)
      : allTasksList();

  // Seed from existing statuses (resuming mid-plan)
  const completedIds = new Set<string>(
    allTasksList().filter((t) => t.status === 'complete').map((t) => t.id),
  );
  // Track failed+blocked IDs together — both block dependents from launching
  const failedIds = new Set<string>(
    allTasksList()
      .filter((t) => t.status === 'failed' || t.status === 'blocked')
      .map((t) => t.id),
  );
  const runningIds = new Set<string>();
  let ranCount = 0;
  let failedCount = 0;

  const getReady = (): TaskState[] =>
    phaseTasks().filter(
      (t) =>
        t.status !== 'complete' &&
        t.status !== 'blocked' &&
        t.status !== 'failed' &&
        !runningIds.has(t.id) &&
        t.dependencies.every((dep) => completedIds.has(dep)),
    );

  const allSettled = (): boolean =>
    phaseTasks().every(
      (t) => t.status === 'complete' || t.status === 'blocked' || t.status === 'failed',
    );

  /**
   * Propagate a failure through the dependency graph using fixed-point
   * iteration. Any task whose dependency chain includes a failed/blocked ID
   * is immediately marked 'blocked' and reported via onTaskDone, so
   * independent branches continue running without interruption.
   */
  const blockDependents = (): void => {
    let changed = true;
    while (changed) {
      changed = false;
      for (const t of allTasksList()) {
        if (
          t.status === 'complete' ||
          t.status === 'failed' ||
          t.status === 'blocked' ||
          runningIds.has(t.id)
        ) continue;
        const blockedBy = t.dependencies.find((dep) => failedIds.has(dep));
        if (blockedBy === undefined) continue;

        t.status = 'blocked';
        t.error = `Blocked: dependency "${blockedBy}" failed`;
        t.updatedAt = new Date().toISOString();
        failedIds.add(t.id);
        failedCount++;
        void persist(plan);
        opts.onTaskDone?.(t, {
          success: false,
          summary: t.error,
          filesModified: [],
          toolCallCount: 0,
          tokensUsed: { input: 0, output: 0, cached: 0 },
        });
        changed = true;
      }
    }
  };

  // Notify-slot: a task completing resolves this to wake the scheduler loop
  let resolveSlot: (() => void) | undefined;
  const waitSlot = (): Promise<void> =>
    new Promise<void>((res) => { resolveSlot = res; });

  const runOne = async (task: TaskState): Promise<void> => {
    runningIds.add(task.id);
    opts.onTaskStart?.(task);
    try {
      const result = await runTask(
        projectPath,
        task,
        plan,
        (msg) => opts.onProgress?.(task.id, msg),
        taskMode,
        undefined,
        undefined,
        undefined,
        signal,
        opts.onText !== undefined ? (delta: string) => opts.onText!(task.id, delta) : undefined,
        opts.model ?? model,
        persist,
        undefined,
        opts.reconciliationReport,
      );
      runningIds.delete(task.id);
      if (result.success) {
        completedIds.add(task.id);
        ranCount++;
      } else {
        failedIds.add(task.id);
        failedCount++;
        blockDependents();
      }
      opts.onTaskDone?.(task, result);
    } catch (err) {
      runningIds.delete(task.id);
      task.status = 'failed';
      task.error = String(err);
      task.updatedAt = new Date().toISOString();
      await persist(plan);
      failedIds.add(task.id);
      failedCount++;
      blockDependents();
      opts.onTaskDone?.(task, {
        success: false,
        summary: String(err),
        filesModified: [],
        toolCallCount: 0,
        tokensUsed: { input: 0, output: 0, cached: 0 },
      });
    }
    resolveSlot?.();
  };

  while (true) {
    if (signal?.aborted) break;

    const ready = getReady();
    const slots = concurrency - runningIds.size;
    for (const task of ready.slice(0, Math.max(0, slots))) {
      void runOne(task);
    }

    if (allSettled()) break;
    // Deadlock guard: nothing running and nothing unblocked left
    if (runningIds.size === 0 && getReady().length === 0) break;

    await waitSlot();
  }

  return { ranCount, failedCount };
}

/**
 * Collect relative paths of TypeScript files created by the transitive dependency
 * chain of the given task. Used to pre-inject source context into the task prompt.
 */
function getTransitiveDependencyFiles(
  taskId: string,
  allTasks: TaskState[],
  projectPath: string,
): string[] {
  const taskMap = new Map(allTasks.map((t) => [t.id, t]));
  const visited = new Set<string>();
  const files: string[] = [];

  const visit = (id: string): void => {
    if (visited.has(id)) return;
    visited.add(id);
    const t = taskMap.get(id);
    if (!t) return;
    for (const dep of t.dependencies) visit(dep);
    if (t.result?.filesModified) {
      for (const absPath of t.result.filesModified) {
        if (!absPath.endsWith('.ts') && !absPath.endsWith('.js')) continue;
        // Normalise to a relative path regardless of whether it was stored absolute or relative.
        const rel = absPath.startsWith(projectPath)
          ? absPath.slice(projectPath.length).replace(/^[\\/]/, '').replace(/\\/g, '/')
          : absPath.replace(/\\/g, '/');
        files.push(rel);
      }
    }
  };

  const current = taskMap.get(taskId);
  if (current) {
    for (const dep of current.dependencies) visit(dep);
  }

  return [...new Set(files)];
}
