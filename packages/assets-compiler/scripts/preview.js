#!/usr/bin/env node
// Compile a sample enemy bundle and open it in the Godot editor.
//
// Usage:
//   pnpm --filter @agent-harness/assets-compiler run preview
//   pnpm --filter @agent-harness/assets-compiler run preview -- --prompt "ember mage with a glowing staff"
//
// Requires GODOT_PATH (or `godot` on PATH).
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(HERE, '..');
const HARNESS_DIR = resolve(PKG_ROOT, 'test', 'godot-harness');
const PREVIEW_DIR = resolve(HARNESS_DIR, 'preview-bundle');
const CLI = resolve(PKG_ROOT, 'bin', 'assets-compiler.js');

function parseArgs(argv) {
  // Default to color-key bg removal so the preview stays offline; pass
  // `--bg-removal rmbg` to download the RMBG model the first time.
  const out = {
    prompt: 'rust-armored skeleton knight, slow heavy attacks',
    seed: undefined,
    bgRemoval: 'color-key',
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--prompt' && argv[i + 1]) { out.prompt = argv[++i]; continue; }
    if (a === '--seed' && argv[i + 1]) { out.seed = argv[++i]; continue; }
    if (a === '--bg-removal' && argv[i + 1]) { out.bgRemoval = argv[++i]; continue; }
  }
  return out;
}

function ensureBuilt() {
  const dist = resolve(PKG_ROOT, 'dist', 'cli.js');
  if (existsSync(dist)) return;
  console.log('[preview] dist/ missing, running build…');
  const r = spawnSync('pnpm', ['run', 'build'], { cwd: PKG_ROOT, stdio: 'inherit', shell: true });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

function compile({ prompt, seed, bgRemoval }) {
  rmSync(PREVIEW_DIR, { recursive: true, force: true });
  mkdirSync(PREVIEW_DIR, { recursive: true });
  const args = [
    CLI, 'compile',
    '--prompt', prompt,
    '--output', PREVIEW_DIR,
    '--bundle-subdir', 'preview-bundle', // matches PREVIEW_DIR's path under the harness project
  ];
  if (seed !== undefined) args.push('--seed', seed);
  if (bgRemoval) args.push('--bg-removal', bgRemoval);
  console.log(`[preview] compiling: ${prompt}`);
  console.log(`[preview]   bg-removal=${bgRemoval}`);
  const r = spawnSync(process.execPath, args, { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

function stripIntermediates() {
  // Keep the harness project tree tidy — the editor doesn't need the .compiler dir.
  rmSync(resolve(PREVIEW_DIR, '.compiler'), { recursive: true, force: true });
}

function launchEditor() {
  const godot = process.env.GODOT_PATH ?? 'godot';
  const scenePath = 'res://preview-bundle/enemy.tscn';
  console.log(`[preview] launching Godot editor → ${scenePath}`);
  console.log(`[preview]   the scene is a single Sprite2D + GroundAnchor — no animations.`);
  const child = spawn(godot, ['--editor', '--path', HARNESS_DIR, scenePath], {
    stdio: 'inherit',
    detached: true,
  });
  child.on('error', (err) => {
    console.error(`[preview] failed to launch Godot: ${err.message}`);
    console.error(`[preview] set GODOT_PATH or put godot on PATH.`);
    process.exit(1);
  });
  child.unref();
}

const args = parseArgs(process.argv.slice(2));
ensureBuilt();
compile(args);
stripIntermediates();
launchEditor();
