import { resolve } from 'path';
import prompts from 'prompts';
import { preprocessBrief, createAdvancedPlan, ClaudeClient } from '@agent-harness/core';
import type { TaskPlan, PreprocessedBrief } from '@agent-harness/core';
import { scaffoldGame } from '@agent-harness/game-adapter';
import { installDeps } from '@agent-harness/tools';
import { loadHarnessConfig } from '../utils/config-loader.js';
import { spinner, c, printSection } from '../utils/output.js';
import { resolveProjectOutputPath } from '../utils/project-name.js';
import { readFile } from 'fs/promises';
import chalk from 'chalk';

export interface PlanGameOptions {
  name?: string;
  brief?: string;
  briefFile?: string;
  output?: string;
  advanced?: boolean;
}

export async function planGame(opts: PlanGameOptions): Promise<void> {
  loadHarnessConfig();

  let gameName = opts.name?.trim();

  // 1. Get brief
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

  // 1b. Clarifying questions — only when brief is short/vague and not pre-supplied
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
  const planSpinner = spinner(
    `Asking Designer agent to plan "${brief.slice(0, 60)}${brief.length > 60 ? '...' : ''}"...`,
  );

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
  const installSpinner = spinner('Installing dependencies...');
  try {
    await installDeps(outputPath);
    installSpinner.succeed('Dependencies installed');
  } catch (err) {
    installSpinner.fail('npm install failed — run manually');
    console.error(c.warn(String(err)));
  }

  // 6. Print rich plan summary
  printSection('Implementation Plan');

  console.log(chalk.bold.white(`  ${plan.gameTitle}`));
  console.log(chalk.dim(`  Genre: ${plan.genre}`));
  console.log(chalk.dim(`  Core loop: ${plan.coreLoop}`));
  console.log();

  if (plan.milestoneScenes.length > 0) {
    console.log(chalk.bold.magenta('  Milestone scenes'));
    for (const milestoneScene of plan.milestoneScenes) {
      const actionSuffix = milestoneScene.primaryAction
        ? chalk.dim(` [action: ${milestoneScene.primaryAction}]`)
        : '';
      console.log(`    ${chalk.dim('·')} ${chalk.white(milestoneScene.sceneId)}: ${milestoneScene.label}${actionSuffix}`);
      for (const criterion of milestoneScene.acceptanceCriteria) {
        console.log(`      ${chalk.dim('-')} ${criterion.id}: ${criterion.description}`);
      }
    }
    console.log();
  }

  const totalTasks = plan.phases.reduce((n, p) => n + p.tasks.length, 0);

  for (const phase of [...plan.phases].sort((a, b) => a.phase - b.phase)) {
    const phaseLabel = (phase as { description?: string }).description ?? '';
    const phaseHeader = phaseLabel
      ? `Phase ${phase.phase}: ${phaseLabel}`
      : `Phase ${phase.phase}`;
    console.log(chalk.bold.cyan(`  ${phaseHeader}`) + chalk.dim(` (${phase.tasks.length} tasks)`));
    for (const task of phase.tasks) {
      const roleTag = chalk.dim(`[${task.role}]`);
      const depInfo =
        task.dependencies.length > 0
          ? chalk.dim(` ← ${task.dependencies.join(', ')}`)
          : '';
      console.log(`    ${chalk.dim('·')} ${chalk.white(task.id)}: ${task.title} ${roleTag}${depInfo}`);
    }
    console.log();
  }

  console.log(chalk.dim(`  Total: ${totalTasks} tasks across ${plan.phases.length} phases`));

  // 7. Next-step instructions
  printSection('Next Steps');
  console.log(c.info(`Project: ${c.path(outputPath)}`));
  console.log();
  console.log('  Review the plan above, then implement all tasks at once:');
  console.log(chalk.cyan(`    game-harness implement-task -p "${outputPath}" --resume`));
  console.log();
  console.log('  Or run a single task at a time:');
  console.log(chalk.cyan(`    game-harness implement-task -p "${outputPath}" --task <task-id>`));
  console.log();
  console.log('  Or use the TUI:');
  console.log(chalk.cyan(`    game-harness tui implement-task --project "${outputPath}" --resume`));
  console.log();
}
