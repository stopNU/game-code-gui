import type { Stage } from '../orchestrator/stage-runner.js';
import type { EnemySpec } from '../types/enemy-spec.js';
import type { RigOutput } from './rig-from-template.js';
import type { VisualOutput, AtlasOutput, MeshStageOutput } from '../types/visual.js';
import { writeTscn } from '../exporter/tscn-writer.js';

export interface ExportStageInput {
  spec: EnemySpec;
  rig: RigOutput;
  visual: VisualOutput;
  /** Present when the textured pipeline ran (visual.kind === 'image'). */
  atlas?: AtlasOutput;
  meshes?: MeshStageOutput;
  /** Per-region fallback colors sampled from the cutout (Phase 2 polish). */
  fallbackColors?: Record<string, string>;
  bundleSubdir?: string;
}

export interface ExportStageOutput {
  tscnPath: string;
}

export const exportGodotStage: Stage<ExportStageInput, ExportStageOutput> = {
  name: 'export',
  async run({ spec, rig, visual, atlas, meshes, fallbackColors, bundleSubdir }, ctx) {
    // Colors source priority: flat-colors visual > segment fallback colors.
    // Phase 1 (flat-colors) fully colors every region. Phase 2 textured may
    // need per-region fallback colors for regions where the texture path
    // can't run (empty mesh, missing atlas rect).
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
      ...(bundleSubdir ? { bundleSubdir } : {}),
    });
    const tscnPath = await ctx.graph.writeBundleFile('enemy.tscn', tscn);
    return { output: { tscnPath }, score: 1.0 };
  },
};
