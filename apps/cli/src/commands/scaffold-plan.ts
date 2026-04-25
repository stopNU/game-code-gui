import { resolve } from 'path';
import { scaffoldPlanService } from '@agent-harness/services';
import chalk from 'chalk';
import { c, printSection, spinner } from '../utils/output.js';
import { resolveProjectOutputPath } from '../utils/project-name.js';

export interface ScaffoldPlanOptions {
  planFile: string;
  output?: string;
}

export async function scaffoldPlan(opts: ScaffoldPlanOptions): Promise<void> {

  const planFile = resolve(process.cwd(), opts.planFile);
  const outputPath = resolveProjectOutputPath(opts.output, 'game');

  printSection('Scaffolding from existing plan');

  const validateSpinner = spinner('Validating plan JSON...');
  let scaffoldSpinner: ReturnType<typeof spinner> | undefined;
  let installSpinner: ReturnType<typeof spinner> | undefined;
  let installDepsFailed = false;

  let plan;
  try {
    plan = await scaffoldPlanService({
      planFile,
      outputPath,
      onStageChange: (stage) => {
        if (stage === 'validating') return;

        if (stage === 'scaffolding') {
          validateSpinner.succeed('Plan validated');
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
        installSpinner?.fail('npm install failed — run manually inside the project');
        console.error(c.warn(String(error)));
      },
    });
  } catch (error) {
    if (installSpinner !== undefined) {
      installSpinner.fail('Installing dependencies failed');
    } else if (scaffoldSpinner !== undefined) {
      scaffoldSpinner.fail('Scaffold failed');
    } else {
      validateSpinner.fail('Plan validation failed');
    }
    throw error;
  }

  if (installSpinner !== undefined && !installDepsFailed) {
    installSpinner.succeed('Dependencies installed');
  }

  printSection('Next Steps');
  console.log(c.info(`Project: ${c.path(outputPath)}`));
  console.log(`  ${chalk.bold(`"${plan.gameTitle}"`)} — ${plan.phases.reduce((n, p) => n + p.tasks.length, 0)} tasks across ${plan.phases.length} phases`);
  console.log();
  console.log('  Implement all tasks:');
  console.log(chalk.cyan(`    game-harness implement-task -p "${outputPath}" --resume`));
  console.log();
  console.log('  Or a single task at a time:');
  console.log(chalk.cyan(`    game-harness implement-task -p "${outputPath}" --task <task-id>`));
  console.log();
}
