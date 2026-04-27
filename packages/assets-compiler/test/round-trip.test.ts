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

describe('assets-compiler round-trip (flat-color path)', () => {
  it('compiles a humanoid enemy and produces a structurally complete .tscn', async () => {
    const out = await mkdtemp(resolve(tmpdir(), 'assets-compiler-'));
    try {
      const result = await compileEnemy({
        prompt: 'rust-armored skeleton knight, slow heavy attacks',
        outputDir: out,
        seed: 12345,
        flatOnly: true, // skip image gen / segmentation / mesh / atlas
        useLlm: false,  // skip LLM call so test is offline-safe
      });
      expect(result.ok).toBe(true);
      expect(existsSync(result.files.tscn)).toBe(true);
      expect(existsSync(result.files.meta)).toBe(true);

      const tscn = await readFile(result.files.tscn, 'utf8');
      expect(tscn).toMatch(/type="Skeleton2D"/);
      expect(tscn).toMatch(/type="AnimationPlayer"/);
      expect(tscn).toMatch(/type="AnimationLibrary"/);
      for (const bone of ['root', 'hip', 'chest', 'head', 'l_upper_arm', 'r_upper_arm', 'l_upper_leg', 'r_upper_leg']) {
        expect(tscn).toMatch(new RegExp(`name="${bone}" type="Bone2D"`));
      }
      for (const anim of ['idle', 'attack', 'hit', 'death']) {
        expect(tscn).toMatch(new RegExp(`resource_name = "${anim}"`));
      }
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
      if (!(await godotAvailable())) return;
      const out = await mkdtemp(resolve(tmpdir(), 'assets-compiler-godot-'));
      try {
        const result = await compileEnemy({
          prompt: 'rust-armored skeleton knight, slow heavy attacks',
          outputDir: out,
          seed: 12345,
          flatOnly: true,
          useLlm: false,
        });

        const stagedDir = resolve(HARNESS_DIR, 'tmp-bundle');
        await rm(stagedDir, { recursive: true, force: true });
        await mkdir(stagedDir, { recursive: true });
        const stagedTscn = resolve(stagedDir, 'enemy.tscn');
        await copyFile(result.files.tscn, stagedTscn);
        const reportPath = resolve(stagedDir, 'report.json');

        try {
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

describe('assets-compiler round-trip (textured path with stub silhouette + color-key)', () => {
  it(
    'runs the full Phase 2 pipeline (stub image gen → bg-removal → mesh → atlas → textured tscn)',
    async () => {
      // Force the offline path: stub silhouette gen + color-key bg removal.
      const prevBg = process.env['ASSETS_COMPILER_BG_REMOVAL'];
      const prevFal = process.env['FAL_KEY'];
      process.env['ASSETS_COMPILER_BG_REMOVAL'] = 'color-key';
      delete process.env['FAL_KEY'];
      const out = await mkdtemp(resolve(tmpdir(), 'assets-compiler-tex-'));
      try {
        const result = await compileEnemy({
          prompt: 'rust-armored skeleton knight, slow heavy attacks',
          outputDir: out,
          seed: 12345,
          useLlm: false,
        });
        expect(result.ok).toBe(true);
        expect(existsSync(result.files.tscn)).toBe(true);
        expect(existsSync(result.files.atlas)).toBe(true);

        // Pipeline ran the textured stages.
        const stageNames = result.stages.map((s) => s.stage);
        expect(stageNames).toContain('segment');
        expect(stageNames).toContain('mesh');
        expect(stageNames).toContain('atlas');

        const tscn = await readFile(result.files.tscn, 'utf8');
        // Textured polygons reference the atlas as an ext_resource and have UVs.
        expect(tscn).toMatch(/ext_resource type="Texture2D"/);
        expect(tscn).toMatch(/uv = PackedVector2Array/);
        expect(tscn).toMatch(/polygons = \[PackedInt32Array/);

        const meta = JSON.parse(await readFile(result.files.meta, 'utf8'));
        expect(meta.scores.segment).toBeGreaterThan(0);
        expect(meta.scores.mesh).toBeGreaterThan(0);
        expect(meta.scores.atlas).toBeGreaterThan(0);

        // Phase 3: rig stage ran and reports its source. The stub silhouette
        // has clean T-pose proportions, so landmarks should detect.
        const rigArtifact = JSON.parse(
          await readFile(resolve(out, '.compiler/rig/output.json'), 'utf8'),
        );
        expect(rigArtifact.source).toBe('procedural');
        expect(rigArtifact.landmarks).toBeDefined();
        expect(rigArtifact.bones?.length).toBe(20);
      } finally {
        if (prevBg === undefined) delete process.env['ASSETS_COMPILER_BG_REMOVAL'];
        else process.env['ASSETS_COMPILER_BG_REMOVAL'] = prevBg;
        if (prevFal !== undefined) process.env['FAL_KEY'] = prevFal;
        await rm(out, { recursive: true, force: true });
      }
    },
    90_000,
  );
});

void writeFile;
