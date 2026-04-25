#!/usr/bin/env node
import { program } from 'commander';
import chalk from 'chalk';
import { newGame } from './commands/new-game.js';
import { planGame } from './commands/plan-game.js';
import { planFeature } from './commands/plan-feature.js';
import { implementTask } from './commands/implement-task.js';
import { runPlaytestCmd } from './commands/run-playtest.js';
import { runEvalsCmd } from './commands/run-evals.js';
import { runtimeLogCmd } from './commands/runtime-log.js';
import { reconcileRuntimeCmd } from './commands/reconcile-runtime.js';
import { inspectScenesCmd } from './commands/inspect-scenes.js';
import { generateAssets } from './commands/generate-assets.js';
import { verifyProjectCmd } from './commands/verify-project.js';

program
  .name('game-harness')
  .description('AI agent harness for building Godot 4 GDScript deckbuilder roguelikes')
  .version('0.1.0');

program
  .command('new-game')
  .description('Scaffold a new Godot 4 deckbuilder roguelike from a text brief')
  .option('-n, --name <name>', 'Game name to use for the default output folder')
  .option('-b, --brief <text>', 'Game description (prompted if omitted)')
  .option('--brief-file <path>', 'Path to a markdown file containing the game brief')
  .option('-o, --output <path>', 'Output directory (default: ./<slugified-game-name>)')
  .option('--plan-only', 'Scaffold and plan only — skip the implementation agent loop')
  .action(async (opts) => {
    await run(() => newGame(opts));
  });

program
  .command('plan-game')
  .description('Plan a game — scaffold + install deps, print the implementation plan, stop before building')
  .option('-n, --name <name>', 'Game name to use for the default output folder')
  .option('-b, --brief <text>', 'Game description (prompted if omitted)')
  .option('--brief-file <path>', 'Path to a markdown file containing the game brief')
  .option('-o, --output <path>', 'Output directory (default: ./<slugified-game-name>)')
  .action(async (opts) => {
    await run(() => planGame(opts));
  });

program
  .command('plan-feature')
  .description('Decompose a new feature into tasks and append to harness/tasks.json')
  .requiredOption('-p, --project <path>', 'Path to game project')
  .requiredOption('-f, --feature <text>', 'Feature description')
  .action(async (opts) => {
    await run(() => planFeature(opts));
  });

program
  .command('implement-task')
  .description('Run the agent loop to implement a single task')
  .requiredOption('-p, --project <path>', 'Path to game project')
  .option('-t, --task <id>', 'Task ID from harness/tasks.json')
  .option('--resume', 'Resume from first non-complete task')
  .option('--concurrency <n>', 'Max parallel tasks in resume mode (default: 3)', '3')
  .option('--model <model>', 'Execution model: sonnet | opus | haiku | codex | subscription (or full model ID)')
  .option('--reconciliation-report <path>', 'Optional reconciliation report path relative to the project for later repair-aware work')
  .action(async (opts) => {
    const rawModel = opts['model'] as string | undefined;
    const resolvedModel = rawModel ? resolveModelId(rawModel) : undefined;
    await run(() => implementTask({
      ...opts,
      ...(resolvedModel !== undefined ? { model: resolvedModel } : {}),
      concurrency: parseInt(opts['concurrency'] as string, 10),
    }));
  });

program
  .command('run-playtest')
  .description('Run the template critical-flow smoke test in Godot headless mode')
  .requiredOption('-p, --project <path>', 'Path to game project')
  .option('-t, --timeout <ms>', 'Timeout waiting for harness output / smoke flow completion')
  .action(async (opts) => {
    await run(() => runPlaytestCmd(opts));
  });

program
  .command('run-evals')
  .description('Run eval suite (build / data / systems / deckbuilder / functional / design) against the game')
  .requiredOption('-p, --project <path>', 'Path to game project')
  .option('-l, --layer <name>', 'Eval layer: build | data | systems | deckbuilder | functional | design | all', 'all')
  .option('--dataset <path>', 'Custom eval dataset JSON (default: baseline-scenarios)')
  .option('--baseline <path>', 'Baseline report JSON for regression comparison')
  .option('--no-fail-on-threshold', 'Do not exit 1 when CI thresholds fail')
  .action(async (opts) => {
    await run(() => runEvalsCmd(opts));
  });

program
  .command('reconcile-runtime')
  .description('Inspect runtime drift read-only and write a reconciliation report with a repair plan')
  .requiredOption('-p, --project <path>', 'Path to game project')
  .option('--report <path>', 'Report output path relative to the project (default: harness/runtime-reconciliation-report.json)')
  .action(async (opts) => {
    await run(() => reconcileRuntimeCmd(opts));
  });

program
  .command('runtime-log')
  .description('Show the latest captured runtime log path and a short error summary')
  .requiredOption('-p, --project <path>', 'Path to game project')
  .option('-m, --mode <mode>', 'Log mode: play | smoke | build | typecheck | scene-binding | autoload-validation | any', 'any')
  .action(async (opts) => {
    await run(() => runtimeLogCmd(opts));
  });

program
  .command('inspect-scenes')
  .description('Print compact JSON for required scene bindings and static instantiation status')
  .requiredOption('-p, --project <path>', 'Path to game project')
  .action(async (opts) => {
    await run(() => inspectScenesCmd(opts));
  });

program
  .command('verify-project')
  .description('Run the authoritative generated-project verification suite and write a JSON report')
  .requiredOption('-p, --project <path>', 'Path to game project')
  .option('-t, --timeout <ms>', 'Timeout waiting for harness output / smoke flow completion')
  .option('--report <path>', 'Report output path relative to the project (default: harness/verify-project-report.json)')
  .action(async (opts) => {
    await run(() => verifyProjectCmd(opts));
  });

program
  .command('generate-assets')
  .description('Generate art assets via FAL.ai — from artPrompt fields or a custom prompt')
  .requiredOption('-p, --project <path>', 'Path to game project')
  .option('-c, --content', 'Generate art for all content entries with artPrompt (cards, enemies, relics)')
  .option('--style <text>', 'Style guide string applied to all prompts')
  .option('-r, --request <text>', 'Asset description (single asset mode)')
  .option('--type <type>', 'Asset type: image | spritesheet | audio | tilemap', 'image')
  .option('--key <key>', 'Asset key (kebab-case)')
  .option('--width <px>', 'Width in pixels', '256')
  .option('--height <px>', 'Height in pixels', '256')
  .action(async (opts) => {
    await run(() => generateAssets(opts));
  });

async function run(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    console.error(chalk.red('\nError:'), err instanceof Error ? err.message : String(err));
    if (process.env['LOG_LEVEL'] === 'debug' && err instanceof Error) {
      console.error(err.stack);
    }
    process.exit(1);
  }
}

program.parse();

function resolveModelId(input: string): string {
  const shorthands: Record<string, string> = {
    sonnet: 'claude-sonnet-4-6',
    opus: 'claude-opus-4-6',
    haiku: 'claude-haiku-4-5-20251001',
    codex: 'gpt-5.4',
    subscription: 'claude-sonnet-4-6-sub',
  };
  return shorthands[input.toLowerCase()] ?? input;
}
