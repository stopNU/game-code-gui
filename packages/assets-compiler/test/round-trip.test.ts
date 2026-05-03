import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, copyFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { writeTscn } from '../src/index.js';
import type { EnemySpec } from '../src/types/enemy-spec.js';

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

const SAMPLE_SPEC: EnemySpec = {
  id: 'sample',
  name: 'Sample',
  prompt: 'sample',
  templateId: 'humanoid',
  palette: ['shadow', 'bone'],
  materials: [],
  mood: 'neutral',
  attackArchetype: 'melee-fast',
  optionalParts: [],
  seed: 1,
};

describe('tscn-writer (static sprite)', () => {
  it('emits a Node2D + Sprite2D + GroundAnchor scene', () => {
    const { tscn } = writeTscn({
      spec: SAMPLE_SPEC,
      spriteFilename: 'enemy.png',
      spriteWidth: 768,
      spriteHeight: 1024,
      footY: 1000,
    });

    expect(tscn).toMatch(/\[gd_scene load_steps=2 format=3/);
    expect(tscn).toMatch(/ext_resource type="Texture2D" path="res:\/\/enemy\.png"/);
    expect(tscn).toMatch(/\[node name="Enemy" type="Node2D"\]/);
    expect(tscn).toMatch(/\[node name="Sprite" type="Sprite2D" parent="\."\]/);
    expect(tscn).toMatch(/centered = false/);
    // offset.x = -W/2 = -384, offset.y = -footY = -1000
    expect(tscn).toMatch(/offset = Vector2\(-384, -1000\)/);
    expect(tscn).toMatch(/\[node name="GroundAnchor" type="Marker2D" parent="\."\]/);

    // No skeletal artifacts.
    expect(tscn).not.toMatch(/Skeleton2D/);
    expect(tscn).not.toMatch(/Bone2D/);
    expect(tscn).not.toMatch(/Polygon2D/);
    expect(tscn).not.toMatch(/AnimationPlayer/);
  });

  it('prefixes the sprite path with bundleSubdir when given', () => {
    const { tscn } = writeTscn({
      spec: SAMPLE_SPEC,
      spriteFilename: 'enemy.png',
      spriteWidth: 256,
      spriteHeight: 256,
      footY: 240,
      bundleSubdir: 'enemies/cultist',
    });
    expect(tscn).toMatch(/path="res:\/\/enemies\/cultist\/enemy\.png"/);
  });

  it(
    'produces a .tscn that loads cleanly in stock Godot 4',
    async () => {
      if (!(await godotAvailable())) return;
      const out = await mkdtemp(resolve(tmpdir(), 'assets-compiler-godot-'));
      try {
        // Synthesize a tiny solid-color PNG as the sprite — the test only
        // validates the .tscn structure, not the image content.
        const sharp = (await import('sharp')).default;
        const pngBuf = await sharp({
          create: { width: 64, height: 64, channels: 4, background: { r: 200, g: 60, b: 60, alpha: 1 } },
        }).png().toBuffer();
        const spritePath = resolve(out, 'enemy.png');
        await (await import('node:fs/promises')).writeFile(spritePath, pngBuf);

        const { tscn } = writeTscn({
          spec: SAMPLE_SPEC,
          spriteFilename: 'enemy.png',
          spriteWidth: 64,
          spriteHeight: 64,
          footY: 60,
          bundleSubdir: 'tmp-bundle',
        });
        const tscnPath = resolve(out, 'enemy.tscn');
        await (await import('node:fs/promises')).writeFile(tscnPath, tscn);

        const stagedDir = resolve(HARNESS_DIR, 'tmp-bundle');
        await rm(stagedDir, { recursive: true, force: true });
        await mkdir(stagedDir, { recursive: true });
        await copyFile(tscnPath, resolve(stagedDir, 'enemy.tscn'));
        await copyFile(spritePath, resolve(stagedDir, 'enemy.png'));
        const reportPath = resolve(stagedDir, 'report.json');

        try {
          // Import the staged PNG so Godot can resolve it as a Texture2D
          // ext_resource. Without this the headless scene loader fails with
          // "no loader found for resource".
          await execFileP(
            GODOT,
            ['--headless', '--import', '--path', HARNESS_DIR],
            { timeout: 60_000 },
          );
          await execFileP(
            GODOT,
            ['--headless', '--path', HARNESS_DIR, '--',
             '--enemy', 'res://tmp-bundle/enemy.tscn', '--report', reportPath],
            { timeout: 60_000 },
          );
        } catch (err) {
          const report = existsSync(reportPath) ? await readFile(reportPath, 'utf8') : '<no report>';
          throw new Error(`godot harness failed: ${(err as Error).message}\nreport: ${report}`);
        }

        const report = JSON.parse(await readFile(reportPath, 'utf8'));
        expect(report.ok).toBe(true);
        expect(report.loaded).toBe(true);
        expect(report.errors).toEqual([]);
        expect(report.hasSprite).toBe(true);
        expect(report.hasGroundAnchor).toBe(true);

        await rm(stagedDir, { recursive: true, force: true });
      } finally {
        await rm(out, { recursive: true, force: true });
      }
    },
    90_000,
  );
});
