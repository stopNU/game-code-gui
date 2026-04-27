import type { RegionRect } from '../templates/registry.js';
import type { Landmarks } from './landmarks.js';

/**
 * Build dynamic region rects (in fractional 0..1 coords) from detected
 * landmarks. Replaces the template's hard-coded rects when landmark
 * detection succeeded.
 *
 * The rects intentionally overlap a bit between adjacent regions so a
 * limb that's slightly offset still gets full coverage somewhere.
 */
export function buildDynamicRegions(L: Landmarks): RegionRect[] {
  const W = L.imageWidth;
  const H = L.imageHeight;
  const px = (x: number) => Math.max(0, Math.min(1, x / W));
  const py = (y: number) => Math.max(0, Math.min(1, y / H));

  const armThickness = Math.max(8, Math.round(L.torsoHalfWidth * 0.7));
  const armBandTop = L.shoulderY - armThickness;
  const armBandBot = L.shoulderY + armThickness;

  // Torso column: between inner shoulders, from shoulderY to hipY.
  const torsoLeft = L.shoulderLx;
  const torsoRight = L.shoulderRx;

  // Hip column: bbox from hipLx..hipRx, from hipY to legSplitY+small.
  const hipBot = Math.min(H - 1, L.legSplitY + Math.round((L.legSplitY - L.hipY) * 0.4));

  const rect = (id: string, x0: number, y0: number, x1: number, y1: number): RegionRect => ({
    id,
    x: px(Math.min(x0, x1)),
    y: py(Math.min(y0, y1)),
    w: px(Math.abs(x1 - x0)) - 0,
    h: py(Math.abs(y1 - y0)) - 0,
  });

  // Limb segment widths (perpendicular to bone direction).
  const halfArm = armThickness;
  const halfLeg = Math.max(8, Math.round(L.torsoHalfWidth * 0.6));

  const elbowLx = Math.round((L.shoulderLx + L.wristLx) / 2);
  const elbowRx = Math.round((L.shoulderRx + L.wristRx) / 2);

  // Foot bounds: small box around each ankle.
  const footHalf = Math.max(10, Math.round(halfLeg * 1.1));

  const regions: RegionRect[] = [
    // Head
    rect('head', L.head.center.x - L.head.halfWidth, L.head.top, L.head.center.x + L.head.halfWidth, L.head.bottom + 2),
    // Torso (chest area, between shoulders)
    rect('torso', torsoLeft, L.shoulderY, torsoRight, L.hipY - 1),
    // Hip (between hipLx..hipRx, hipY..hipBot)
    rect('hip', L.hipLx, L.hipY, L.hipRx, hipBot),

    // Left arm (T-pose: horizontal segments at shoulderY)
    rect('l_upper_arm', elbowLx, armBandTop, L.shoulderLx, armBandBot),
    rect('l_lower_arm', L.wristLx + Math.round((elbowLx - L.wristLx) * 0.2), armBandTop, elbowLx, armBandBot),
    rect('l_hand', L.wristLx - halfArm, armBandTop, L.wristLx + Math.round(halfArm * 0.5), armBandBot),

    // Right arm
    rect('r_upper_arm', L.shoulderRx, armBandTop, elbowRx, armBandBot),
    rect('r_lower_arm', elbowRx, armBandTop, L.wristRx - Math.round((L.wristRx - elbowRx) * 0.2), armBandBot),
    rect('r_hand', L.wristRx - Math.round(halfArm * 0.5), armBandTop, L.wristRx + halfArm, armBandBot),

    // Left leg (vertical)
    rect('l_upper_leg', L.legL.hip.x - halfLeg, L.hipY, L.legL.hip.x + halfLeg, L.legL.knee.y),
    rect('l_lower_leg', L.legL.knee.x - halfLeg, L.legL.knee.y, L.legL.knee.x + halfLeg, L.legL.ankle.y - 4),
    rect('l_foot', L.legL.ankle.x - footHalf, L.legL.ankle.y - 6, L.legL.ankle.x + footHalf, Math.min(H - 1, L.legL.ankle.y + Math.round(halfLeg * 0.3))),

    // Right leg
    rect('r_upper_leg', L.legR.hip.x - halfLeg, L.hipY, L.legR.hip.x + halfLeg, L.legR.knee.y),
    rect('r_lower_leg', L.legR.knee.x - halfLeg, L.legR.knee.y, L.legR.knee.x + halfLeg, L.legR.ankle.y - 4),
    rect('r_foot', L.legR.ankle.x - footHalf, L.legR.ankle.y - 6, L.legR.ankle.x + footHalf, Math.min(H - 1, L.legR.ankle.y + Math.round(halfLeg * 0.3))),
  ];

  return regions;
}
