import { execa } from 'execa';
import { stat } from 'fs/promises';
import { join } from 'path';
import type { BuildOutput, TypecheckOutput } from '../types/project.js';

/**
 * Run an incremental TypeScript type-check against the game project.
 *
 * Uses `--incremental` so TypeScript writes a `.tsbuildinfo` cache file next to
 * `tsconfig.json`.  Subsequent calls only re-analyse changed files, cutting
 * check time from ~15 s (cold) to ~1–3 s in the verify-and-fix loop.
 *
 * `preferLocal: true` resolves `tsc` from the project's own
 * `node_modules/.bin`, handling both npm- and pnpm-installed projects and
 * Windows `.cmd` shims transparently.
 */
export async function runTypeCheck(projectPath: string): Promise<TypecheckOutput> {
  const start = Date.now();
  const result = await execa(
    'tsc',
    ['--noEmit', '--incremental'],
    { cwd: projectPath, reject: false, timeout: 60000, preferLocal: true },
  );

  const output = (result.stdout ?? '') + (result.stderr ?? '');
  const errorLines = output
    .split('\n')
    .filter((l: string) => l.includes('error TS') || l.includes(': error'));

  return {
    success: (result.exitCode ?? 0) === 0,
    errorCount: errorLines.length,
    errors: errorLines.slice(0, 20),
    durationMs: Date.now() - start,
  };
}

/**
 * Bundle the game with Vite.
 *
 * Calls `vite build` directly (via `node_modules/.bin`) rather than
 * `pnpm run build`.  This avoids the redundant `tsc &&` prefix that the old
 * template build script had — Vite transpiles TypeScript internally via
 * esbuild, so a pre-pass through tsc is wasted work.  Type errors are caught
 * separately by `runTypeCheck`.
 */
export async function runBuild(projectPath: string): Promise<BuildOutput> {
  const start = Date.now();
  const result = await execa(
    'vite',
    ['build'],
    { cwd: projectPath, reject: false, timeout: 120000, preferLocal: true },
  );

  let bundleSizeKb = 0;
  try {
    const distDir = join(projectPath, 'dist');
    const { glob } = await import('glob');
    const files = await glob('**/*.js', { cwd: distDir, absolute: true });
    for (const f of files) {
      const s = await stat(f);
      bundleSizeKb += s.size / 1024;
    }
  } catch {
    // dist doesn't exist yet
  }

  return {
    success: (result.exitCode ?? 0) === 0,
    bundleSizeKb: Math.round(bundleSizeKb),
    outputDir: join(projectPath, 'dist'),
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    durationMs: Date.now() - start,
  };
}
