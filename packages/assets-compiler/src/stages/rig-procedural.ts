import type { Stage } from '../orchestrator/stage-runner.js';
import type { EnemySpec } from '../types/enemy-spec.js';
import type { VisualOutput } from '../types/visual.js';
import type { Animation, Skeleton, Vec2 } from '../types/skeleton.js';
import type { RegionRect } from '../templates/registry.js';
import { loadTemplate } from '../templates/registry.js';
import { detectLandmarks, type Landmarks } from '../rig/landmarks.js';
import { buildProceduralSkeleton } from '../rig/build-skeleton.js';
import { buildDynamicRegions } from '../rig/build-regions.js';

export interface ProceduralRigInput {
  spec: EnemySpec;
  visual: VisualOutput;
  /** Path to the bg-removed cutout. Required when we want landmark detection. */
  cutoutPath?: string;
}

export interface ProceduralRigOutput {
  templateId: string;
  canvasSize: { width: number; height: number };
  rootOffset: Vec2;
  skeleton: Skeleton;
  animations: Animation[];
  /** Source for the rig: 'procedural' = landmarks worked, 'template' = fallback. */
  source: 'procedural' | 'template';
  /** Detected landmarks (only when source === 'procedural'). */
  landmarks?: Landmarks;
  /** Bone absolute canvas positions (only when source === 'procedural'). */
  boneAbs?: Record<string, Vec2>;
  /** Dynamic region rects derived from landmarks; the segment stage uses these. */
  dynamicRegions?: RegionRect[];
}

export const rigProceduralStage: Stage<ProceduralRigInput, ProceduralRigOutput> = {
  name: 'rig',
  async run({ spec, visual, cutoutPath }, ctx) {
    const template = await loadTemplate(spec.templateId);

    // Template-only path: visual didn't produce an image, or no cutout yet.
    if (visual.kind !== 'image' || !cutoutPath) {
      const out: ProceduralRigOutput = {
        templateId: template.templateId,
        canvasSize: template.canvasSize,
        rootOffset: template.rootOffset,
        skeleton: template.skeleton,
        animations: template.animations,
        source: 'template',
      };
      await ctx.graph.writeJson('rig', 'output.json', { ...out, source: out.source });
      return { output: out, score: 1.0 };
    }

    // Try landmark detection.
    const landmarks = await detectLandmarks(cutoutPath);
    if (!landmarks) {
      const out: ProceduralRigOutput = {
        templateId: template.templateId,
        canvasSize: template.canvasSize,
        rootOffset: template.rootOffset,
        skeleton: template.skeleton,
        animations: template.animations,
        source: 'template',
      };
      await ctx.graph.writeJson('rig', 'output.json', { source: 'template', reason: 'landmark detection failed' });
      return {
        output: out,
        score: 0.5,
        issues: [{ severity: 'warn', message: 'landmark detection failed; using template skeleton' }],
      };
    }

    // Procedural path.
    const proc = buildProceduralSkeleton(template, landmarks);
    const dynamicRegions = buildDynamicRegions(landmarks);

    const out: ProceduralRigOutput = {
      templateId: template.templateId,
      canvasSize: template.canvasSize,
      rootOffset: proc.rootCanvas,
      skeleton: proc.skeleton,
      animations: template.animations,
      source: 'procedural',
      landmarks,
      boneAbs: proc.boneAbs,
      dynamicRegions,
    };
    await ctx.graph.writeJson('rig', 'output.json', {
      source: out.source,
      landmarks,
      boneAbs: proc.boneAbs,
      bones: proc.skeleton.bones,
    });
    return { output: out, score: 1.0 };
  },
};
