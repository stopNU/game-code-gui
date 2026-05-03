#!/usr/bin/env node
import { Command } from 'commander';
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { compileEnemy } from './orchestrator/compile.js';

// Load .env from cwd and from the monorepo root.
//   dist/cli.js → ../ = packages/assets-compiler → ../../ = packages → ../../../ = repo root
loadEnv({ path: resolve(process.cwd(), '.env') });
loadEnv({ path: resolve(import.meta.dirname, '../../../.env') });
// Also try one level deeper in case the package is hoisted differently.
loadEnv({ path: resolve(import.meta.dirname, '../../../../.env') });

const program = new Command();

program
  .name('assets-compiler')
  .description('Compile text prompts into static enemy sprite bundles for Godot')
  .version('0.1.0');

program
  .command('compile')
  .description('Compile a single enemy from a prompt')
  .requiredOption('-p, --prompt <text>', 'enemy description')
  .requiredOption('-o, --output <dir>', 'output bundle directory')
  .option('-s, --seed <n>', 'deterministic seed', (v) => parseInt(v, 10))
  .option('--id <id>', 'override slug id')
  .option('--name <name>', 'override display name')
  .option('--retries <n>', 'per-stage retry budget', (v) => parseInt(v, 10))
  .option('--no-llm', 'use rule-based prompt parser only (skip ANTHROPIC_API_KEY usage)')
  .option('--bg-removal <mode>', 'background removal adapter: "rmbg" (default) or "color-key"', 'rmbg')
  .option('--bundle-subdir <path>', 'sub-path inside the consuming Godot project (e.g. "enemies/cultist"); used to prefix sprite ext_resource path')
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

    if (opts.bgRemoval === 'color-key') {
      process.env['ASSETS_COMPILER_BG_REMOVAL'] = 'color-key';
    }
    try {
      const result = await compileEnemy({
        prompt: opts.prompt,
        outputDir: resolve(opts.output),
        ...(opts.seed !== undefined ? { seed: opts.seed } : {}),
        ...(opts.id ? { id: opts.id } : {}),
        ...(opts.name ? { name: opts.name } : {}),
        ...(opts.retries !== undefined ? { retries: { perStage: opts.retries } } : {}),
        ...(opts.llm === false ? { useLlm: false } : {}),
        ...(opts.bundleSubdir ? { bundleSubdir: opts.bundleSubdir } : {}),
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
            for (const issue of evt.result.issues) {
              log(`    ${issue.severity}: ${issue.message}`);
            }
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
        log(`  sprite: ${result.files.sprite}`);
        log(`  meta:   ${result.files.meta}`);
        // Visibility: which image-gen ran?
        try {
          const fs = await import('node:fs/promises');
          const visualOut = JSON.parse(
            await fs.readFile(resolve(result.bundlePath, '.compiler/visual/output.json'), 'utf8'),
          );
          if (visualOut.provenance) {
            log(`  visual: ${visualOut.provenance}  (${visualOut.width}×${visualOut.height})`);
          }
        } catch {
          // Intermediate artifacts not present (visual stage failed).
        }
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

program.parseAsync(process.argv).catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
  process.exit(2);
});
