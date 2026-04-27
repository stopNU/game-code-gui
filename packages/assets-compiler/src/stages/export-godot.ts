import type { Stage } from '../orchestrator/stage-runner.js';
import type { EnemySpec } from '../types/enemy-spec.js';
import type { RigOutput } from './rig-from-template.js';
import type { VisualOutput } from './visual-stub.js';
import { writeTscn } from '../exporter/tscn-writer.js';

export interface ExportStageInput {
  spec: EnemySpec;
  rig: RigOutput;
  visual: VisualOutput;
}

export interface ExportStageOutput {
  tscnPath: string;
}

export const exportGodotStage: Stage<ExportStageInput, ExportStageOutput> = {
  name: 'export',
  async run({ spec, rig, visual }, ctx) {
    const { tscn } = writeTscn({
      spec,
      skeleton: rig.skeleton,
      animations: rig.animations,
      rootOffset: rig.rootOffset,
      regionColors: visual.regionColors,
    });
    const tscnPath = await ctx.graph.writeBundleFile('enemy.tscn', tscn);
    return { output: { tscnPath }, score: 1.0 };
  },
};
