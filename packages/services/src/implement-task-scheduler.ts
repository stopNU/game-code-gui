import { join } from 'path';
import type { TaskPlan, TaskResult, TaskState } from '@agent-harness/core';
import type { ParallelRunOptions, ParallelRunResult } from './implement-task-types.js';
import { makeWriteQueue } from './implement-task-shared.js';
import { runTask } from './implement-task-runner.js';

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
  const { concurrency = 3, signal, model } = opts;
  const tasksPath = join(projectPath, 'harness', 'tasks.json');
  const persist = makeWriteQueue(tasksPath);

  const allTasksList = (): TaskState[] => plan.phases.flatMap((phase) => phase.tasks);
  const phaseTasks = (): TaskState[] =>
    opts.phaseFilter !== undefined
      ? allTasksList().filter((task) => task.phase === opts.phaseFilter)
      : allTasksList();

  const completedIds = new Set<string>(
    allTasksList().filter((task) => task.status === 'complete').map((task) => task.id),
  );
  const failedIds = new Set<string>(
    allTasksList()
      .filter((task) => task.status === 'failed' || task.status === 'blocked')
      .map((task) => task.id),
  );
  const runningIds = new Set<string>();
  let ranCount = 0;
  let failedCount = 0;

  const getReady = (): TaskState[] =>
    phaseTasks().filter(
      (task) =>
        task.status !== 'complete'
        && task.status !== 'blocked'
        && task.status !== 'failed'
        && !runningIds.has(task.id)
        && task.dependencies.every((dependency) => completedIds.has(dependency)),
    );

  const allSettled = (): boolean =>
    phaseTasks().every(
      (task) => task.status === 'complete' || task.status === 'blocked' || task.status === 'failed',
    );

  const blockDependents = (): void => {
    let changed = true;
    while (changed) {
      changed = false;
      for (const task of allTasksList()) {
        if (
          task.status === 'complete'
          || task.status === 'failed'
          || task.status === 'blocked'
          || runningIds.has(task.id)
        ) {
          continue;
        }

        const blockedBy = task.dependencies.find((dependency) => failedIds.has(dependency));
        if (blockedBy === undefined) {
          continue;
        }

        task.status = 'blocked';
        task.error = `Blocked: dependency "${blockedBy}" failed`;
        task.updatedAt = new Date().toISOString();
        failedIds.add(task.id);
        failedCount++;
        void persist(plan);
        opts.onTaskDone?.(task, createSchedulerFailureResult(task.error));
        changed = true;
      }
    }
  };

  let resolveSlot: (() => void) | undefined;
  const waitSlot = (): Promise<void> =>
    new Promise<void>((resolve) => {
      resolveSlot = resolve;
    });

  const runOne = async (task: TaskState): Promise<void> => {
    runningIds.add(task.id);
    opts.onTaskStart?.(task);
    try {
      const result = await runTask(
        projectPath,
        task,
        plan,
        (message) => opts.onProgress?.(task.id, message),
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
    } catch (error) {
      runningIds.delete(task.id);
      task.status = 'failed';
      task.error = String(error);
      task.updatedAt = new Date().toISOString();
      await persist(plan);
      failedIds.add(task.id);
      failedCount++;
      blockDependents();
      opts.onTaskDone?.(task, createSchedulerFailureResult(String(error)));
    }
    resolveSlot?.();
  };

  while (true) {
    if (signal?.aborted) {
      break;
    }

    const ready = getReady();
    const slots = concurrency - runningIds.size;
    for (const task of ready.slice(0, Math.max(0, slots))) {
      void runOne(task);
    }

    if (allSettled()) {
      break;
    }
    if (runningIds.size === 0 && getReady().length === 0) {
      break;
    }

    await waitSlot();
  }

  return { ranCount, failedCount };
}

function createSchedulerFailureResult(summary: string): TaskResult {
  return {
    success: false,
    summary,
    filesModified: [],
    toolCallCount: 0,
    tokensUsed: { input: 0, output: 0, cached: 0 },
  };
}
