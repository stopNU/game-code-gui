import { copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Stage } from '../orchestrator/stage-runner.js';
import type { EnemySpec } from '../types/enemy-spec.js';
import { writeTscn } from '../exporter/tscn-writer.js';

export interface ExportStageInput {
  spec: EnemySpec;
  /** Bg-removed PNG produced earlier in the pipeline. */
  cutoutPath: string;
  spriteWidth: number;
  spriteHeight: number;
  footY: number;
  bundleSubdir?: string;
}

export interface ExportStageOutput {
  tscnPath: string;
  spritePath: string;
}

const SPRITE_FILENAME = 'enemy.png';

export const exportGodotStage: Stage<ExportStageInput, ExportStageOutput> = {
  name: 'export',
  async run({ spec, cutoutPath, spriteWidth, spriteHeight, footY, bundleSubdir }, ctx) {
    const spritePath = resolve(ctx.graph.bundleDir, SPRITE_FILENAME);
    await copyFile(cutoutPath, spritePath);

    const { tscn } = writeTscn({
      spec,
      spriteFilename: SPRITE_FILENAME,
      spriteWidth,
      spriteHeight,
      footY,
      ...(bundleSubdir ? { bundleSubdir } : {}),
    });
    const tscnPath = await ctx.graph.writeBundleFile('enemy.tscn', tscn);
    return { output: { tscnPath, spritePath }, score: 1.0 };
  },
};
