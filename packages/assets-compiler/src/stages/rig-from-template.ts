import type { Stage } from '../orchestrator/stage-runner.js';
import type { EnemySpec } from '../types/enemy-spec.js';
import type { Skeleton, Animation, Vec2 } from '../types/skeleton.js';
import { loadTemplate } from '../templates/registry.js';

export interface RigOutput {
  templateId: string;
  canvasSize: { width: number; height: number };
  rootOffset: Vec2;
  skeleton: Skeleton;
  animations: Animation[];
}

/**
 * Phase 1 rig + motion stage: loads the hand-authored humanoid template
 * (skeleton + 4 animation clips) and passes it through.
 *
 * Phases 2-3 split this into separate `rig-build` and `motion-map` stages
 * that build per-enemy rigs from segmentation output.
 */
export const rigFromTemplateStage: Stage<EnemySpec, RigOutput> = {
  name: 'rig',
  async run(spec, ctx) {
    const template = await loadTemplate(spec.templateId);
    await ctx.graph.writeJson('rig', 'skeleton.json', template.skeleton);
    await ctx.graph.writeJson('rig', 'animations.json', template.animations);
    return {
      output: {
        templateId: template.templateId,
        canvasSize: template.canvasSize,
        rootOffset: template.rootOffset,
        skeleton: template.skeleton,
        animations: template.animations,
      },
      score: 1.0,
    };
  },
};
