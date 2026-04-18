import { fileURLToPath } from 'url';
import { writeFile, readFile } from 'fs/promises';
import {
  detectNPCs,
  getSystemPrompt,
  MemoryStore,
  type AgentRole,
  type TaskPlan,
  type TaskResult,
  type TaskState,
  type TokenUsageBreakdownEntry,
  type TokenUsagePhase,
} from '@agent-harness/core';

export const BUNDLED_EVAL_DATASET = fileURLToPath(
  new URL('../../../../packages/evals/src/data/baseline-scenarios.json', import.meta.url),
);

const memoryWriteQueues = new Map<string, Promise<void>>();

export function rolePrompt(role: AgentRole, _mode: string, task: TaskState): string {
  return getSystemPrompt(role, undefined, {
    hasNPCs: detectNPCs(task.title, task.description),
  });
}

/** Serialize writes to tasks.json so concurrent agents don't clobber each other. */
export function makeWriteQueue(tasksPath: string): (plan: TaskPlan) => Promise<void> {
  let queue = Promise.resolve();
  return (plan: TaskPlan): Promise<void> => {
    queue = queue.then(() => writeFile(tasksPath, JSON.stringify(plan, null, 2), 'utf8'));
    return queue;
  };
}

export async function loadMemoryStore(
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

export async function persistTaskSummary(
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

export function buildRepairTask(
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

export function withTokenBreakdown(result: TaskResult, phase: TokenUsagePhase): TaskResult {
  if (result.tokenBreakdown !== undefined) {
    return result;
  }

  return {
    ...result,
    tokenBreakdown: [{ phase, tokensUsed: result.tokensUsed }],
  };
}

export function mergeTokenBreakdowns(
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
