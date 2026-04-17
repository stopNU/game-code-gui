import { resolve } from 'path';
import prompts from 'prompts';
import { preprocessBrief, createAdvancedPlan, ClaudeClient } from '@agent-harness/core';
import type { TaskPlan, TaskState, PreprocessedBrief } from '@agent-harness/core';
import { scaffoldGame } from '@agent-harness/game-adapter';
import { installDeps, runScript } from '@agent-harness/tools';
import { loadHarnessConfig } from '../utils/config-loader.js';
import { spinner, c, printSection } from '../utils/output.js';
import { resolveProjectOutputPath } from '../utils/project-name.js';
import { runTask } from './implement-task.js';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';

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

  // 1. Get brief
  let brief: string | undefined;
  let briefFromFlag = false;

  if (opts.briefFile) {
    // Load brief from file
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
      validate: (v: string) => (v.length > 10 ? true : 'Please provide more detail'),
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
      validate: (v: string) => (v.trim().length > 0 ? true : 'Please enter a game name'),
    });
    gameName = (response.gameName as string | undefined)?.trim();
    if (!gameName) {
      console.log(c.warn('Aborted.'));
      return;
    }
  }

  // 1b. Clarifying questions — only when brief is short/vague and not pre-supplied via --brief or --brief-file
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

  // 2. Determine output path
  const outputPath = resolveProjectOutputPath(opts.output, gameName ?? 'game');

  // 3. Plan
  printSection('Creating game plan');
  const planSpinner = spinner(`Asking Designer agent to plan "${brief.slice(0, 60)}${brief.length > 60 ? '...' : ''}"...`);

  let plan: TaskPlan;
  let preprocessedBrief: PreprocessedBrief | undefined;
  try {
    const client = new ClaudeClient();
    planSpinner.text = 'Preprocessing brief...';
    const preprocessed = await preprocessBrief(brief, client);
    preprocessedBrief = preprocessed;
    planSpinner.text = 'Running planner...';
    plan = await createAdvancedPlan(preprocessed, client);
    planSpinner.succeed(`Plan created: "${plan.gameTitle}" (${plan.genre})`);
  } catch (err) {
    planSpinner.fail('Planning failed');
    throw err;
  }

  // 4. Scaffold
  printSection('Scaffolding project');
  const scaffoldSpinner = spinner('Creating Godot project structure...');

  try {
    await scaffoldGame({
      outputPath,
      plan,
      ...(preprocessedBrief !== undefined ? { preprocessedBrief } : {}),
    });
    scaffoldSpinner.succeed(`Project created at ${c.path(outputPath)}`);
  } catch (err) {
    scaffoldSpinner.fail('Scaffold failed');
    throw err;
  }

  // 5. Install deps
  const installSpinner = spinner('Installing dependencies (npm install)...');
  try {
    await installDeps(outputPath);
    installSpinner.succeed('Dependencies installed');
  } catch (err) {
    installSpinner.fail('npm install failed — run manually');
    console.error(c.warn(String(err)));
  }

  if (opts.planOnly) {
    printSection('Done (plan only)');
    console.log(c.info(`Run tasks with: game-harness implement-task --project ${outputPath} --task <taskId>`));
    return;
  }

  // 6. Implement tasks
  printSection('Implementing game');

  const tasksPath = join(outputPath, 'harness', 'tasks.json');
  const tasksToRun = collectAllTasks(plan);
  const completedIds = new Set<string>();
  const previousTaskSummaries: string[] = [];

  console.log(c.info(`Running ${tasksToRun.length} tasks across all phases...`));

  for (const task of tasksToRun) {
    // Skip if a dependency failed
    const blockedBy = task.dependencies.find(
      (dep) => !completedIds.has(dep) && tasksToRun.some((t) => t.id === dep),
    );
    if (blockedBy) {
      console.log(c.warn(`  Skipping "${task.id}" — dependency "${blockedBy}" did not complete`));
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

      // Re-read plan from disk so we always have the latest statuses
      const freshPlan: TaskPlan = JSON.parse(await readFile(tasksPath, 'utf8')) as TaskPlan;
      const freshTask = findTask(freshPlan, task.id);
      if (!freshTask) break;

      // Inject accumulated summaries so each agent knows what was already built
      freshTask.context.previousTaskSummaries = [...previousTaskSummaries];
      freshTask.retries = attempt;

      try {
        const result = await runTask(outputPath, freshTask, freshPlan, (msg) => {
          taskSpinner.text = `[Phase ${task.phase}] ${task.title} — ${msg}`;
        });

        if (result.success) {
          taskSpinner.succeed(`[Phase ${task.phase}] ${task.title}`);
          completedIds.add(task.id);
          previousTaskSummaries.push(`[${task.id}] ${task.title}: ${result.summary}`);
          succeeded = true;
        } else if (attempt < task.maxRetries) {
          taskSpinner.text = `[Phase ${task.phase}] ${task.title} — failed, retrying...`;
        }
      } catch (err) {
        if (attempt >= task.maxRetries) {
          taskSpinner.fail(`[Phase ${task.phase}] ${task.title}: ${String(err).slice(0, 60)}`);
        }
      }
    }

    if (!succeeded) {
      taskSpinner.fail(`[Phase ${task.phase}] ${task.title}`);
    }
  }

  // 7. Post-implementation typecheck
  printSection('Validating build');
  const typecheckSpinner = spinner('Running typecheck...');
  try {
    const check = await runScript(outputPath, 'typecheck');
    if (check.success) {
      typecheckSpinner.succeed('Typecheck passed — no type errors');
    } else {
      typecheckSpinner.fail('Typecheck found errors');
      const output = [check.stdout, check.stderr].filter(Boolean).join('\n');
      console.log(c.warn(output));
    }
  } catch (err) {
    typecheckSpinner.fail(`Typecheck failed to run: ${String(err).slice(0, 80)}`);
  }

  // 8. Verify-and-fix loop — run game-specific input checks, auto-fix on failure
  if (plan.verificationSteps.length > 0) {
    printSection('Verifying mechanics');
    await verifyAndFix(outputPath, plan, previousTaskSummaries);
  }

  // 9. Summary
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

/**
 * Godot headless verification — Phase 6 will implement this fully.
 * Runs `godot --headless --path {outputPath} -- --harness-test` and reads
 * harness/test-output.json. Currently a no-op placeholder.
 */
async function verifyAndFix(
  _outputPath: string,
  _plan: TaskPlan,
  _previousTaskSummaries: string[],
  _maxIterations = 3,
): Promise<void> {
  // TODO Phase 6: implement Godot headless playtest + fix loop
}

/** All tasks from all phases, sorted by phase number. */
function collectAllTasks(plan: TaskPlan): TaskState[] {
  return [...plan.phases]
    .sort((a, b) => a.phase - b.phase)
    .flatMap((p) => p.tasks);
}

function findTask(plan: TaskPlan, id: string): TaskState | undefined {
  for (const phase of plan.phases) {
    const t = phase.tasks.find((t) => t.id === id);
    if (t) return t;
  }
  return undefined;
}
