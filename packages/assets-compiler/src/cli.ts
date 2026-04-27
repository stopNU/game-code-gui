#!/usr/bin/env node
import { Command } from 'commander';
import { resolve } from 'node:path';
import { compileEnemy } from './orchestrator/compile.js';

const program = new Command();

program
  .name('assets-compiler')
  .description('Compile text prompts into game-ready 2D skeletal enemy bundles for Godot')
  .version('0.1.0');

program
  .command('compile')
  .description('Compile a single enemy from a prompt')
  .requiredOption('-p, --prompt <text>', 'enemy description')
  .requiredOption('-o, --output <dir>', 'output bundle directory')
  .option('-t, --template <id>', 'anatomy template id', 'humanoid')
  .option('-s, --seed <n>', 'deterministic seed', (v) => parseInt(v, 10))
  .option('--id <id>', 'override slug id')
  .option('--name <name>', 'override display name')
  .option('--retries <n>', 'per-stage retry budget', (v) => parseInt(v, 10))
  .option('--json', 'emit JSON progress to stdout', false)
  .action(async (opts) => {
    const startedAt = Date.now();
    const useJson: boolean = !!opts.json;
    const log = (line: string) => {
      if (!useJson) process.stdout.write(line + '\n');
    };
    const emit = (obj: unknown) => {
      if (useJson) process.stdout.write(JSON.stringify(obj) + '\n');
    };

    try {
      const result = await compileEnemy({
        prompt: opts.prompt,
        outputDir: resolve(opts.output),
        templateId: opts.template,
        ...(opts.seed !== undefined ? { seed: opts.seed } : {}),
        ...(opts.id ? { id: opts.id } : {}),
        ...(opts.name ? { name: opts.name } : {}),
        ...(opts.retries !== undefined ? { retries: { perStage: opts.retries } } : {}),
        onEvent: (evt) => {
          if (useJson) {
            emit(evt);
            return;
          }
          if (evt.type === 'stage-start') {
            log(`▶ ${evt.stage} (attempt ${evt.attempt})`);
          } else if (evt.type === 'stage-result') {
            const sym = evt.result.ok ? '✓' : '✗';
            log(`${sym} ${evt.stage} score=${evt.result.score.toFixed(2)} retries=${evt.result.retries} (${evt.result.durationMs}ms)`);
          } else if (evt.type === 'stage-retry') {
            log(`↻ ${evt.stage}: ${evt.reason}`);
          }
        },
      });

      const summary = {
        ok: result.ok,
        bundlePath: result.bundlePath,
        files: result.files,
        durationMs: Date.now() - startedAt,
        stages: result.stages.map((s) => ({
          stage: s.stage,
          ok: s.ok,
          score: s.score,
          retries: s.retries,
          durationMs: s.durationMs,
        })),
      };

      if (useJson) {
        emit({ type: 'done', summary });
      } else {
        log('');
        log(`✓ compiled in ${summary.durationMs}ms`);
        log(`  bundle: ${result.bundlePath}`);
        log(`  tscn:   ${result.files.tscn}`);
        log(`  meta:   ${result.files.meta}`);
      }
      process.exit(result.ok ? 0 : 1);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (useJson) {
        emit({ type: 'error', message });
      } else {
        process.stderr.write(`✗ ${message}\n`);
      }
      process.exit(2);
    }
  });

program
  .command('templates')
  .description('List available anatomy templates')
  .action(() => {
    process.stdout.write('humanoid\n');
  });

program.parseAsync(process.argv).catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
  process.exit(2);
});
