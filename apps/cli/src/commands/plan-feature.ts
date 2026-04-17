import { decomposeTasks } from '@agent-harness/core';
import { loadHarnessConfig, loadTasksJson, saveTasksJson } from '../utils/config-loader.js';
import { spinner, c, printSection, printTable } from '../utils/output.js';

export interface PlanFeatureOptions {
  project: string;
  feature: string;
}

export async function planFeature(opts: PlanFeatureOptions): Promise<void> {
  loadHarnessConfig();

  const projectPath = opts.project;

  const loadSpinner = spinner('Loading existing task plan...');
  let plan;
  try {
    plan = await loadTasksJson(projectPath);
    loadSpinner.succeed(`Loaded plan for "${plan.gameTitle}"`);
  } catch (err) {
    loadSpinner.fail('Could not load harness/tasks.json');
    throw err;
  }

  printSection('Planning feature');
  const planSpinner = spinner(`Decomposing: "${opts.feature}"...`);

  let newTasks;
  try {
    newTasks = await decomposeTasks(plan, opts.feature);
    planSpinner.succeed(`Generated ${newTasks.length} task(s)`);
  } catch (err) {
    planSpinner.fail('Planning failed');
    throw err;
  }

  // Inject project path into task contexts
  const now = new Date().toISOString();
  for (const task of newTasks) {
    task.context.projectPath = projectPath;
    task.context.gameSpec = `${plan.gameBrief}\n\nCore loop: ${plan.coreLoop}`;
    task.createdAt = now;
    task.updatedAt = now;
  }

  // Append tasks to plan (phase 2 by default if not specified)
  const phase2 = plan.phases.find((p) => p.phase === 2);
  if (phase2) {
    phase2.tasks.push(...newTasks);
  } else {
    plan.phases.push({ phase: 2, tasks: newTasks });
  }

  await saveTasksJson(projectPath, plan);

  printSection('Tasks created');
  printTable(
    newTasks.map((t) => ({
      id: t.id,
      role: t.role,
      title: t.title.slice(0, 40),
      status: t.status,
    })),
  );

  console.log();
  console.log(c.info('Run a task:'));
  console.log(`  game-harness implement-task --project ${projectPath} --task ${newTasks[0]?.id ?? '<taskId>'}`);
}
