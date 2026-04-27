import { mkdir } from 'node:fs/promises';
import sharp from 'sharp';
import type { Stage } from '../orchestrator/stage-runner.js';
import type { EnemySpec } from '../types/enemy-spec.js';
import type { VisualOutput } from '../types/visual.js';
import { pickImageGen, type ImageGenAdapter } from '../adapters/image-gen.js';
import { REQUIRED_REGIONS } from './visual-stub.js';

export interface VisualStageConfig {
  width: number;
  height: number;
  /** Override the adapter (tests). Default is FAL when keyed, stub otherwise. */
  adapter?: ImageGenAdapter;
}

const DEFAULT_CONFIG: VisualStageConfig = {
  width: 768,
  height: 1024,
};

const COLOR_WORDS: Record<string, string> = {
  rust: '#8a3a1f', bone: '#dcd2b5', soot: '#2c2520', ember: '#c4501c',
  ash: '#7a7268', moss: '#3e5a2c', jade: '#3a8a64', crimson: '#8a1f2c',
  azure: '#2c5e8a', gold: '#c69a3a', silver: '#a8b0b8', shadow: '#1a1820',
  blood: '#5e1218', ivory: '#e8dec8', obsidian: '#0d0c14',
};

function paletteFallback(spec: EnemySpec): VisualOutput {
  const hexes = spec.palette.map((p) => COLOR_WORDS[p.toLowerCase()] ?? '#6a5a4a');
  const primary = hexes[0] ?? '#6a5a4a';
  const limb = hexes[1] ?? primary;
  const head = liftHex(primary, 16);
  const regionColors: Record<string, string> = {};
  for (const r of REQUIRED_REGIONS) {
    regionColors[r] = r === 'head' ? head : (r === 'torso' || r === 'hip' ? primary : limb);
  }
  return { kind: 'flat-colors', regionColors };
}

function liftHex(hex: string, amount: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1]!, 16);
  const r = Math.min(255, ((n >> 16) & 0xff) + amount);
  const g = Math.min(255, ((n >> 8) & 0xff) + amount);
  const b = Math.min(255, (n & 0xff) + amount);
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

export function createVisualStage(config: VisualStageConfig = DEFAULT_CONFIG): Stage<EnemySpec, VisualOutput> {
  return {
    name: 'visual',
    async run(spec, ctx) {
      const dir = await ctx.graph.ensureStageDir('visual');
      await mkdir(dir, { recursive: true });
      const adapter = config.adapter ?? pickImageGen();
      try {
        const r = await adapter.generate({ spec, outDir: dir, width: config.width, height: config.height });
        // Verify the file actually decodes — guards against partial downloads.
        const meta = await sharp(r.pngPath).metadata();
        if (!meta.width || !meta.height) {
          throw new Error('image-gen output has no dimensions');
        }
        const out: VisualOutput = {
          kind: 'image',
          neutralPath: r.pngPath,
          width: meta.width,
          height: meta.height,
          provenance: r.provenance,
        };
        await ctx.graph.writeJson('visual', 'output.json', out);
        // Score: image path always 1.0 if we reach here. Quality is graded
        // by the silhouette evaluator after segmentation.
        return { output: out, score: 1.0 };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const fallback = paletteFallback(spec);
        await ctx.graph.writeJson('visual', 'output.json', fallback);
        return {
          output: fallback,
          score: 0.5, // usable but degraded — orchestrator can decide whether to retry
          issues: [{ severity: 'warn', message: `image-gen failed (${message}); using flat-color fallback` }],
        };
      }
    },
  };
}

export const visualStage = createVisualStage();
