import { mkdir } from 'node:fs/promises';
import sharp from 'sharp';
import type { Stage } from '../orchestrator/stage-runner.js';
import type { EnemySpec } from '../types/enemy-spec.js';
import type { VisualOutput } from '../types/visual.js';
import { pickImageGen, type ImageGenAdapter } from '../adapters/image-gen.js';

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

export function createVisualStage(config: VisualStageConfig = DEFAULT_CONFIG): Stage<EnemySpec, VisualOutput> {
  return {
    name: 'visual',
    async run(spec, ctx) {
      const dir = await ctx.graph.ensureStageDir('visual');
      await mkdir(dir, { recursive: true });
      const adapter = config.adapter ?? pickImageGen();
      const r = await adapter.generate({ spec, outDir: dir, width: config.width, height: config.height });
      // Verify the file actually decodes — guards against partial downloads.
      const meta = await sharp(r.pngPath).metadata();
      if (!meta.width || !meta.height) {
        throw new Error('image-gen output has no dimensions');
      }
      const out: VisualOutput = {
        neutralPath: r.pngPath,
        width: meta.width,
        height: meta.height,
        provenance: r.provenance,
      };
      await ctx.graph.writeJson('visual', 'output.json', out);
      // Score is graded by the silhouette evaluator after bg-removal.
      return { output: out, score: 1.0 };
    },
  };
}

export const visualStage = createVisualStage();
