import { readFile } from 'fs/promises';
import { resolve } from 'path';
import type { TaskPlan } from '@agent-harness/core';
import type { PlanGameStage } from '@agent-harness/services';
import { planGameService } from '@agent-harness/services';
import chalk from 'chalk';
import prompts from 'prompts';
import { loadHarnessConfig } from '../utils/config-loader.js';
import { c, printSection, spinner } from '../utils/output.js';
import { resolveProjectOutputPath } from '../utils/project-name.js';

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
          installSpinner = spinner('Installing dependencies...');
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

  const totalTasks = plan.phases.reduce((count, phase) => count + phase.tasks.length, 0);

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
          ? chalk.dim(` <- ${task.dependencies.join(', ')}`)
          : '';
      console.log(`    ${chalk.dim('·')} ${chalk.white(task.id)}: ${task.title} ${roleTag}${depInfo}`);
    }
    console.log();
  }

  console.log(chalk.dim(`  Total: ${totalTasks} tasks across ${plan.phases.length} phases`));

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
