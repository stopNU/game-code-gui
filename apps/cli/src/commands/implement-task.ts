import { readFile } from 'fs/promises';
import { join, resolve } from 'path';
import { normalizeTaskPlan, type TaskPlan, type TaskState } from '@agent-harness/core';
import {
  formatTokenBreakdownLines,
  formatTokenCount,
  runTask,
  runTasksParallel,
  type ImplementTaskOptions,
  type ParallelRunOptions,
  type ParallelRunResult,
} from '@agent-harness/services';
import { loadHarnessConfig } from '../utils/config-loader.js';
import { spinner, c, printSection } from '../utils/output.js';

export {
  runTask,
  runTasksParallel,
  type ImplementTaskOptions,
  type ParallelRunOptions,
  type ParallelRunResult,
};

export async function implementTask(opts: ImplementTaskOptions): Promise<void> {
  loadHarnessConfig();

  const projectPath = resolve(process.cwd(), opts.project);
  const tasksPath = join(projectPath, 'harness', 'tasks.json');
  const concurrency = Math.max(1, opts.concurrency ?? 3);

  if (opts.resume) {
    const plan: TaskPlan = normalizeTaskPlan(
      JSON.parse(await readFile(tasksPath, 'utf8')),
      projectPath,
    );
    const allTasks = plan.phases.flatMap((phase) => phase.tasks);
    const completedBefore = allTasks.filter((task) => task.status === 'complete').length;
    const remaining = allTasks.length - completedBefore;

    printSection(`Resuming: ${remaining} tasks remaining (concurrency: ${concurrency})`);

    const spinners = new Map<string, ReturnType<typeof spinner>>();
    const { ranCount, failedCount } = await runTasksParallel(projectPath, plan, {
      concurrency,
      ...(opts.model !== undefined ? { model: opts.model } : {}),
      ...(opts.reconciliationReport !== undefined ? { reconciliationReport: opts.reconciliationReport } : {}),
      onTaskStart: (task) => {
        const taskSpinner = spinner(`[${task.id}] ${task.title}`);
        spinners.set(task.id, taskSpinner);
      },
      onProgress: (taskId, msg) => {
        const taskSpinner = spinners.get(taskId);
        if (taskSpinner !== undefined) {
          taskSpinner.text = `[${taskId}] ${msg}`;
        }
      },
      onTaskDone: (task, result) => {
        const taskSpinner = spinners.get(task.id);
        if (taskSpinner === undefined) {
          return;
        }

        if (result.success) {
          taskSpinner.succeed(`[${task.id}] ${task.title} (${result.toolCallCount} tool calls)`);
        } else {
          taskSpinner.fail(`[${task.id}] ${task.title} - ${result.summary.slice(0, 60)}`);
        }
      },
    });

    printSection('Resume Summary');
    console.log(`Completed: ${ranCount} | Failed: ${failedCount}`);
    return;
  }

  if (!opts.task) {
    throw new Error('Either --task <id> or --resume is required.');
  }

  const plan: TaskPlan = normalizeTaskPlan(
    JSON.parse(await readFile(tasksPath, 'utf8')),
    projectPath,
  );
  let task: TaskState | undefined;
  let phaseIdx = -1;
  let taskIdx = -1;

  for (let pi = 0; pi < plan.phases.length; pi++) {
    const phase = plan.phases[pi]!;
    for (let ti = 0; ti < phase.tasks.length; ti++) {
      if (phase.tasks[ti]!.id === opts.task) {
        task = phase.tasks[ti];
        phaseIdx = pi;
        taskIdx = ti;
        break;
      }
    }
    if (task !== undefined) {
      break;
    }
  }

  if (task === undefined) {
    throw new Error(`Task "${opts.task}" not found in harness/tasks.json`);
  }

  if (task.status === 'complete') {
    console.log(c.warn(`Task "${opts.task}" is already complete.`));
    return;
  }

  printSection(`Implementing: ${task.title}`);
  console.log(c.dim(`Role: ${task.role} | Task: ${task.id}`));

  const loopSpinner = spinner('Agent loop running...');
  const result = await runTask(
    projectPath,
    task,
    plan,
    (msg) => {
      loopSpinner.text = msg;
    },
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    opts.model,
    undefined,
    undefined,
    opts.reconciliationReport,
  );

  plan.phases[phaseIdx]!.tasks[taskIdx] = task;

  if (result.success) {
    loopSpinner.succeed(`Task complete (${result.toolCallCount} tool calls, ${result.tokensUsed.output} output tokens)`);
  } else {
    loopSpinner.fail(`Task failed: ${result.summary.slice(0, 80)}`);
  }

  if (result.filesModified.length > 0) {
    printSection('Files modified');
    result.filesModified.forEach((filePath) => console.log(c.path(filePath)));
  }

  printSection('Summary');
  console.log(result.summary.slice(0, 400));

  const tokenBreakdownLines = formatTokenBreakdownLines(result);
  if (tokenBreakdownLines.length > 0) {
    printSection('Token usage');
    console.log(
      `total: in ${formatTokenCount(result.tokensUsed.input)}, out ${formatTokenCount(result.tokensUsed.output)}, cached ${formatTokenCount(result.tokensUsed.cached)}`,
    );
    tokenBreakdownLines.forEach((line) => console.log(`- ${line}`));
  }
}
