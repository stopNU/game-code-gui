import { readFile } from 'fs/promises';
import { join, resolve } from 'path';
import type { TaskPlan, TaskState } from '@agent-harness/core';
import type { PlanGameStage } from '@agent-harness/services';
import { planGameService } from '@agent-harness/services';
import prompts from 'prompts';
import { runScript } from '@agent-harness/tools';
import { loadHarnessConfig } from '../utils/config-loader.js';
import { c, printSection, spinner } from '../utils/output.js';
import { resolveProjectOutputPath } from '../utils/project-name.js';
import { runTask } from './implement-task.js';

export interface NewGameOptions {
  name?: string;
  brief?: string;
  briefFile?: string;
  output?: string;
  planOnly?: boolean;
  advanced?: boolean;
}

export async function newGame(opts: NewGameOptions): Promise<void> {
  loadHarnessConfig();

  let gameName = opts.name?.trim();

  let brief: string | undefined;
  let briefFromFlag = false;

  if (opts.briefFile) {
    const filePath = resolve(process.cwd(), opts.briefFile);
    brief = await readFile(filePath, 'utf8');
    briefFromFlag = true;
  } else if (opts.brief) {
    brief = opts.brief;
    briefFromFlag = true;
  } else {
    const response = await prompts({
      type: 'text',
      name: 'brief',
      message: 'Describe your game:',
      validate: (value: string) => (value.length > 10 ? true : 'Please provide more detail'),
    });
    brief = response.brief as string;
    if (!brief) {
      console.log(c.warn('Aborted.'));
      return;
    }
  }

  if (!gameName && !opts.output) {
    const response = await prompts({
      type: 'text',
      name: 'gameName',
      message: 'Game name:',
      validate: (value: string) => (value.trim().length > 0 ? true : 'Please enter a game name'),
    });
    gameName = (response.gameName as string | undefined)?.trim();
    if (!gameName) {
      console.log(c.warn('Aborted.'));
      return;
    }
  }

  if (!briefFromFlag && brief.length < 120) {
    console.log(c.info('A few quick questions to sharpen the plan (press Enter to skip any):'));
    const clarify = await prompts([
      {
        type: 'text',
        name: 'genre',
        message: 'Genre / gameplay style (e.g. platformer, puzzle, shooter, idle):',
      },
      {
        type: 'text',
        name: 'theme',
        message: 'Theme or setting (e.g. space, medieval, underwater, cyberpunk):',
      },
      {
        type: 'text',
        name: 'mechanic',
        message: 'One must-have mechanic (e.g. double jump, inventory, time rewind):',
      },
    ]);

    const extras = [
      clarify.genre ? `Genre: ${clarify.genre as string}` : '',
      clarify.theme ? `Theme/setting: ${clarify.theme as string}` : '',
      clarify.mechanic ? `Key mechanic: ${clarify.mechanic as string}` : '',
    ].filter(Boolean);

    if (extras.length > 0) {
      brief = `${brief}\n\n${extras.join('\n')}`;
    }
  }

  const outputPath = resolveProjectOutputPath(opts.output, gameName ?? 'game');

  printSection('Creating game plan');
  const planSpinner = spinner(
    `Asking Designer agent to plan "${brief.slice(0, 60)}${brief.length > 60 ? '...' : ''}"...`,
  );

  let plan: TaskPlan;
  let scaffoldSpinner: ReturnType<typeof spinner> | undefined;
  let installSpinner: ReturnType<typeof spinner> | undefined;
  let planningCompleted = false;
  let installDepsFailed = false;

  try {
    plan = await planGameService({
      brief,
      outputPath,
      onStageChange: (stage: PlanGameStage) => {
        if (stage === 'preprocessing') {
          planSpinner.text = 'Preprocessing brief...';
          return;
        }

        if (stage === 'planning') {
          planSpinner.text = 'Running planner...';
          return;
        }

        if (stage === 'scaffolding') {
          planSpinner.succeed('Plan created');
          planningCompleted = true;
          printSection('Scaffolding project');
          scaffoldSpinner = spinner('Creating Godot project structure...');
          return;
        }

        if (stage === 'installing-deps') {
          scaffoldSpinner?.succeed(`Project created at ${c.path(outputPath)}`);
          installSpinner = spinner('Installing dependencies (npm install)...');
        }
      },
      onInstallDepsError: (error: unknown) => {
        installDepsFailed = true;
        installSpinner?.fail('npm install failed - run manually');
        console.error(c.warn(String(error)));
      },
    });
  } catch (error) {
    if (installSpinner !== undefined) {
      installSpinner.fail('Installing dependencies failed');
    } else if (scaffoldSpinner !== undefined) {
      scaffoldSpinner.fail('Scaffold failed');
    } else {
      planSpinner.fail('Planning failed');
    }
    throw error;
  }

  if (!planningCompleted) {
    planSpinner.succeed(`Plan created: "${plan.gameTitle}" (${plan.genre})`);
  }

  if (installSpinner !== undefined && !installDepsFailed) {
    installSpinner.succeed('Dependencies installed');
  }

  if (opts.planOnly) {
    printSection('Done (plan only)');
    console.log(c.info(`Run tasks with: game-harness implement-task --project ${outputPath} --task <taskId>`));
    return;
  }

  printSection('Implementing game');

  const tasksPath = join(outputPath, 'harness', 'tasks.json');
  const tasksToRun = collectAllTasks(plan);
  const completedIds = new Set<string>();
  const previousTaskSummaries: string[] = [];

  console.log(c.info(`Running ${tasksToRun.length} tasks across all phases...`));

  for (const task of tasksToRun) {
    const blockedBy = task.dependencies.find(
      (dependency) => !completedIds.has(dependency) && tasksToRun.some((candidate) => candidate.id === dependency),
    );
    if (blockedBy) {
      console.log(c.warn(`  Skipping "${task.id}" - dependency "${blockedBy}" did not complete`));
      task.status = 'blocked';
      task.updatedAt = new Date().toISOString();
      continue;
    }

    const taskSpinner = spinner(`[Phase ${task.phase}] ${task.title}`);
    let succeeded = false;

    for (let attempt = 0; attempt <= task.maxRetries && !succeeded; attempt++) {
      if (attempt > 0) {
        console.log(c.warn(`  Retrying "${task.id}" (attempt ${attempt + 1}/${task.maxRetries + 1})...`));
      }

      const freshPlan: TaskPlan = JSON.parse(await readFile(tasksPath, 'utf8')) as TaskPlan;
      const freshTask = findTask(freshPlan, task.id);
      if (!freshTask) {
        break;
      }

      freshTask.context.previousTaskSummaries = [...previousTaskSummaries];
      freshTask.retries = attempt;

      try {
        const result = await runTask(outputPath, freshTask, freshPlan, (message) => {
          taskSpinner.text = `[Phase ${task.phase}] ${task.title} - ${message}`;
        });

        if (result.success) {
          taskSpinner.succeed(`[Phase ${task.phase}] ${task.title}`);
          completedIds.add(task.id);
          previousTaskSummaries.push(`[${task.id}] ${task.title}: ${result.summary}`);
          succeeded = true;
        } else if (attempt < task.maxRetries) {
          taskSpinner.text = `[Phase ${task.phase}] ${task.title} - failed, retrying...`;
        }
      } catch (error) {
        if (attempt >= task.maxRetries) {
          taskSpinner.fail(`[Phase ${task.phase}] ${task.title}: ${String(error).slice(0, 60)}`);
        }
      }
    }

    if (!succeeded) {
      taskSpinner.fail(`[Phase ${task.phase}] ${task.title}`);
    }
  }

  printSection('Validating build');
  const typecheckSpinner = spinner('Running typecheck...');
  try {
    const check = await runScript(outputPath, 'typecheck');
    if (check.success) {
      typecheckSpinner.succeed('Typecheck passed - no type errors');
    } else {
      typecheckSpinner.fail('Typecheck found errors');
      const output = [check.stdout, check.stderr].filter(Boolean).join('\n');
      console.log(c.warn(output));
    }
  } catch (error) {
    typecheckSpinner.fail(`Typecheck failed to run: ${String(error).slice(0, 80)}`);
  }

  if (plan.verificationSteps.length > 0) {
    printSection('Verifying mechanics');
    await verifyAndFix(outputPath, plan, previousTaskSummaries);
  }

  printSection('Done');
  console.log(c.success(`Game: ${plan.gameTitle}`));
  console.log(c.info(`Genre: ${plan.genre}`));
  console.log(c.info(`Core loop: ${plan.coreLoop}`));
  console.log();
  console.log(`Project: ${c.path(outputPath)}`);
  console.log(`  cd ${outputPath}`);
  console.log('  godot --path .');
  console.log('  # or: game-harness tui implement-task --project . --resume');
}

async function verifyAndFix(
  _outputPath: string,
  _plan: TaskPlan,
  _previousTaskSummaries: string[],
  _maxIterations = 3,
): Promise<void> {
  // TODO Phase 6: implement Godot headless playtest + fix loop
}

function collectAllTasks(plan: TaskPlan): TaskState[] {
  return [...plan.phases]
    .sort((a, b) => a.phase - b.phase)
    .flatMap((phase) => phase.tasks);
}

function findTask(plan: TaskPlan, id: string): TaskState | undefined {
  for (const phase of plan.phases) {
    const task = phase.tasks.find((candidate) => candidate.id === id);
    if (task) {
      return task;
    }
  }
  return undefined;
}
