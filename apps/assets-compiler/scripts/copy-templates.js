#!/usr/bin/env node
// Copy non-TS template assets (JSON bone hierarchies, motion clips) into dist/
// so the published package can resolve them at runtime relative to the JS files.
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const srcRoot = resolve(here, '..', 'src', 'templates');
const dstRoot = resolve(here, '..', 'dist', 'templates');

if (!existsSync(srcRoot)) {
  process.exit(0);
}
mkdirSync(dstRoot, { recursive: true });
cpSync(srcRoot, dstRoot, { recursive: true, filter: (s) => !s.endsWith('.ts') });
console.log(`[assets-compiler] copied templates -> ${dstRoot}`);
