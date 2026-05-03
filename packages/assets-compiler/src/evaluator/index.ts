import sharp from 'sharp';

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
