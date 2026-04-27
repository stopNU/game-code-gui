import type { Landmarks } from '../rig/landmarks.js';
import type { EvalScore } from './index.js';

/**
 * Sanity-check detected landmarks against expected anatomical relations
 * for a T-pose biped. Score reflects how many checks pass.
 */
export function rigSanityScore(L: Landmarks): EvalScore {
  const issues: EvalScore['issues'] = [];
  const checks: Array<{ name: string; ok: boolean; msg?: string }> = [];

  // Vertical order: head_top < shoulder < hip < knee < ankle.
  checks.push({
    name: 'head above shoulders',
    ok: L.head.bottom <= L.shoulderY,
    msg: `head_bot=${L.head.bottom}, shoulder=${L.shoulderY}`,
  });
  checks.push({
    name: 'shoulders above hips',
    ok: L.shoulderY < L.hipY,
    msg: `shoulder=${L.shoulderY}, hip=${L.hipY}`,
  });
  checks.push({
    name: 'hips above knees',
    ok: L.hipY < L.legL.knee.y && L.hipY < L.legR.knee.y,
    msg: `hip=${L.hipY}, kneeL=${L.legL.knee.y}, kneeR=${L.legR.knee.y}`,
  });
  checks.push({
    name: 'knees above ankles',
    ok: L.legL.knee.y < L.legL.ankle.y && L.legR.knee.y < L.legR.ankle.y,
    msg: `kneeL=${L.legL.knee.y}, ankleL=${L.legL.ankle.y}; kneeR=${L.legR.knee.y}, ankleR=${L.legR.ankle.y}`,
  });

  // Horizontal symmetry: left landmarks left of center, right right of center.
  checks.push({
    name: 'left arm extends left of center',
    ok: L.shoulderLx < L.centerX && L.wristLx < L.shoulderLx,
    msg: `wristLx=${L.wristLx}, shoulderLx=${L.shoulderLx}, cx=${L.centerX}`,
  });
  checks.push({
    name: 'right arm extends right of center',
    ok: L.shoulderRx > L.centerX && L.wristRx > L.shoulderRx,
    msg: `wristRx=${L.wristRx}, shoulderRx=${L.shoulderRx}, cx=${L.centerX}`,
  });
  checks.push({
    name: 'feet roughly symmetric',
    ok: Math.abs(
      (L.legL.ankle.x - L.centerX) + (L.legR.ankle.x - L.centerX),
    ) < L.imageWidth * 0.05,
  });

  // Head not absurdly large (would indicate detection error).
  const headHeight = L.head.bottom - L.head.top;
  const figureHeight = L.legL.ankle.y - L.head.top;
  checks.push({
    name: 'head proportion plausible',
    ok: headHeight / Math.max(1, figureHeight) < 0.4,
    msg: `headH=${headHeight}, figH=${figureHeight}`,
  });

  for (const c of checks) {
    if (!c.ok) {
      issues.push({ severity: 'warn', message: `rig: ${c.name} (${c.msg ?? ''})` });
    }
  }
  const passed = checks.filter((c) => c.ok).length;
  return { score: passed / checks.length, issues };
}
