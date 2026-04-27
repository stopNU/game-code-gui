import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile, copyFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { compileEnemy } from '../src/index.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const HARNESS_DIR = resolve(HERE, 'godot-harness');

const execFileP = promisify(execFile);

const GODOT = process.env.GODOT_PATH ?? 'godot';

async function godotAvailable(): Promise<boolean> {
  try {
    await execFileP(GODOT, ['--version'], { timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}

describe('assets-compiler round-trip', () => {
  it('compiles a humanoid enemy and produces a structurally complete .tscn', async () => {
    const out = await mkdtemp(resolve(tmpdir(), 'assets-compiler-'));
    try {
      const result = await compileEnemy({
        prompt: 'rust-armored skeleton knight, slow heavy attacks',
        outputDir: out,
        seed: 12345,
      });
      expect(result.ok).toBe(true);
      expect(existsSync(result.files.tscn)).toBe(true);
      expect(existsSync(result.files.meta)).toBe(true);

      const tscn = await readFile(result.files.tscn, 'utf8');
      // Must reference Skeleton2D, key bones, AnimationPlayer, all four clips.
      expect(tscn).toMatch(/type="Skeleton2D"/);
      expect(tscn).toMatch(/type="AnimationPlayer"/);
      expect(tscn).toMatch(/type="AnimationLibrary"/);
      for (const bone of ['root', 'hip', 'chest', 'head', 'l_upper_arm', 'r_upper_arm', 'l_upper_leg', 'r_upper_leg']) {
        expect(tscn).toMatch(new RegExp(`name="${bone}" type="Bone2D"`));
      }
      for (const anim of ['idle', 'attack', 'hit', 'death']) {
        expect(tscn).toMatch(new RegExp(`resource_name = "${anim}"`));
      }
      // 15 Polygon2D meshes (one per region in REQUIRED_REGIONS).
      const polyCount = (tscn.match(/type="Polygon2D"/g) ?? []).length;
      expect(polyCount).toBe(15);

      const meta = JSON.parse(await readFile(result.files.meta, 'utf8'));
      expect(meta.id).toBe('rust_armored_skeleton_knight');
      expect(meta.attackArchetype).toBe('melee-heavy');
      expect(meta.seed).toBe(12345);
    } finally {
      await rm(out, { recursive: true, force: true });
    }
  });

  it(
    'produces a .tscn that loads cleanly in stock Godot 4',
    async () => {
      if (!(await godotAvailable())) {
        // Skip silently when Godot isn't installed.
        return;
      }
      const out = await mkdtemp(resolve(tmpdir(), 'assets-compiler-godot-'));
      try {
        const result = await compileEnemy({
          prompt: 'rust-armored skeleton knight, slow heavy attacks',
          outputDir: out,
          seed: 12345,
        });

        // Stage the bundle inside the harness Godot project so res:// paths resolve.
        const stagedDir = resolve(HARNESS_DIR, 'tmp-bundle');
        await rm(stagedDir, { recursive: true, force: true });
        await mkdir(stagedDir, { recursive: true });
        const stagedTscn = resolve(stagedDir, 'enemy.tscn');
        await copyFile(result.files.tscn, stagedTscn);
        const reportPath = resolve(stagedDir, 'report.json');

        try {
          await execFileP(
            GODOT,
            [
              '--headless',
              '--path', HARNESS_DIR,
              '--', // separator: everything after is user args (OS.get_cmdline_user_args)
              '--enemy', 'res://tmp-bundle/enemy.tscn',
              '--report', reportPath,
            ],
            { timeout: 60_000 },
          );
        } catch (err) {
          // Godot may exit non-zero if the harness reports issues; we still want
          // the report contents in the failure message.
          const report = existsSync(reportPath) ? await readFile(reportPath, 'utf8') : '<no report>';
          throw new Error(`godot harness failed: ${(err as Error).message}\nreport: ${report}`);
        }

        const report = JSON.parse(await readFile(reportPath, 'utf8'));
        expect(report.ok).toBe(true);
        expect(report.loaded).toBe(true);
        expect(report.errors).toEqual([]);
        // 20 bones in the humanoid template (root + hip + spine/chest/neck/head + arms + legs).
        expect(report.bones.length).toBe(20);
        expect(report.meshes.length).toBe(15);
        const animNames = (report.animations as Array<{ name: string }>).map((a) => a.name).sort();
        expect(animNames).toEqual(['attack', 'death', 'hit', 'idle']);

        await rm(stagedDir, { recursive: true, force: true });
      } finally {
        await rm(out, { recursive: true, force: true });
      }
    },
    90_000,
  );
});

// silence unused warnings for helpers we keep available for future tests
void writeFile;
