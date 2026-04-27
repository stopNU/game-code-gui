import sharp from 'sharp';
import type { SegmentOutput, MeshStageOutput } from '../types/visual.js';

export interface EvalScore {
  score: number;
  issues: Array<{ severity: 'warn' | 'error'; message: string }>;
}

/**
 * Silhouette readability: opaque-pixel ratio of the bg-removed cutout
 * downsampled to 64×64 (proxy for "is this still a recognizable figure
 * at thumbnail size"). Penalize both very-low (<5%) and very-high (>80%)
 * coverage; sweet spot ~25-50%.
 */
export async function silhouetteScore(cutoutPath: string): Promise<EvalScore> {
  const small = await sharp(cutoutPath)
    .resize(64, 64, { fit: 'inside' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let opaque = 0;
  const total = small.info.width * small.info.height;
  for (let i = 3; i < small.data.length; i += 4) {
    if (small.data[i]! > 32) opaque += 1;
  }
  const ratio = opaque / total;
  const issues: EvalScore['issues'] = [];
  // Map ratio → score: bell curve peaking at 0.35.
  const peak = 0.35;
  const spread = 0.30;
  const score = Math.max(0, 1 - Math.abs(ratio - peak) / spread);
  if (ratio < 0.05) issues.push({ severity: 'warn', message: `silhouette nearly empty (${(ratio * 100).toFixed(1)}%)` });
  if (ratio > 0.80) issues.push({ severity: 'warn', message: `silhouette overflows (${(ratio * 100).toFixed(1)}%)` });
  return { score, issues };
}

/**
 * Part coverage: fraction of expected regions that have any opaque pixels,
 * with a coverage-area floor.
 */
export function partCoverageScore(seg: SegmentOutput, expectedRegions: number, minPx = 32): EvalScore {
  const have = seg.regions.filter((r) => r.coveragePx >= minPx).length;
  const score = expectedRegions === 0 ? 0 : have / expectedRegions;
  const issues: EvalScore['issues'] = [];
  if (have < expectedRegions) {
    const missing = seg.regions
      .filter((r) => r.coveragePx < minPx)
      .map((r) => r.region)
      .join(', ');
    issues.push({ severity: 'warn', message: `low/no coverage in: ${missing}` });
  }
  return { score, issues };
}

/**
 * Mesh sanity: simple checks per region — non-empty triangle list, no
 * zero-area or degenerate triangles, vertex count within budget.
 */
export function meshSanityScore(meshes: MeshStageOutput, maxVertsPerRegion = 80): EvalScore {
  const issues: EvalScore['issues'] = [];
  if (meshes.meshes.length === 0) return { score: 0, issues: [{ severity: 'error', message: 'no meshes built' }] };

  let bad = 0;
  for (const m of meshes.meshes) {
    if (m.triangles.length === 0) {
      issues.push({ severity: 'warn', message: `${m.region}: no triangles` });
      bad += 1;
      continue;
    }
    if (m.vertices.length > maxVertsPerRegion) {
      issues.push({ severity: 'warn', message: `${m.region}: vertex count ${m.vertices.length} exceeds budget ${maxVertsPerRegion}` });
      bad += 1;
    }
    let degenerate = 0;
    for (let t = 0; t < m.triangles.length; t += 3) {
      const a = m.vertices[m.triangles[t]!]!;
      const b = m.vertices[m.triangles[t + 1]!]!;
      const c = m.vertices[m.triangles[t + 2]!]!;
      const area2 = Math.abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y));
      if (area2 < 1) degenerate += 1;
    }
    const triCount = m.triangles.length / 3;
    if (degenerate / Math.max(1, triCount) > 0.1) {
      issues.push({ severity: 'warn', message: `${m.region}: ${degenerate}/${triCount} degenerate triangles` });
      bad += 1;
    }
  }
  const score = Math.max(0, 1 - bad / meshes.meshes.length);
  return { score, issues };
}
