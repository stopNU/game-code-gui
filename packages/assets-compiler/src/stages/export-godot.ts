import type { Stage } from '../orchestrator/stage-runner.js';
import type { EnemySpec } from '../types/enemy-spec.js';
import type { ProceduralRigOutput } from './rig-procedural.js';
import type { VisualOutput, AtlasOutput, MeshStageOutput } from '../types/visual.js';
import { writeTscn, type ProceduralRigInfo } from '../exporter/tscn-writer.js';

export interface ExportStageInput {
  spec: EnemySpec;
  /** Either the template rig or the procedural rig — same shape, source-tagged. */
  rig: ProceduralRigOutput;
  visual: VisualOutput;
  /** Present when the textured pipeline ran (visual.kind === 'image'). */
  atlas?: AtlasOutput;
  meshes?: MeshStageOutput;
  /** Per-region fallback colors sampled from the cutout (Phase 2 polish). */
  fallbackColors?: Record<string, string>;
  /** Phase 3 procedural rig info — bone abs positions + region source bounds. */
  proceduralRig?: ProceduralRigInfo;
  bundleSubdir?: string;
}

export interface ExportStageOutput {
  tscnPath: string;
}

export const exportGodotStage: Stage<ExportStageInput, ExportStageOutput> = {
  name: 'export',
  async run({ spec, rig, visual, atlas, meshes, fallbackColors, proceduralRig, bundleSubdir }, ctx) {
    const regionColors = visual.kind === 'flat-colors'
      ? visual.regionColors
      : fallbackColors;
    const { tscn } = writeTscn({
      spec,
      skeleton: rig.skeleton,
      animations: rig.animations,
      rootOffset: rig.rootOffset,
      ...(regionColors ? { regionColors } : {}),
      ...(atlas ? { atlas } : {}),
      ...(meshes ? { regionMeshes: meshes.meshes } : {}),
      ...(proceduralRig ? { proceduralRig } : {}),
      ...(bundleSubdir ? { bundleSubdir } : {}),
    });
    const tscnPath = await ctx.graph.writeBundleFile('enemy.tscn', tscn);
    return { output: { tscnPath }, score: 1.0 };
  },
};
