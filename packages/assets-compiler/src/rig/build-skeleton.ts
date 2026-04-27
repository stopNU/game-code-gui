import type { Bone, Mesh, Skeleton, Vec2 } from '../types/skeleton.js';
import type { Landmarks } from './landmarks.js';
import type { TemplateData } from '../templates/registry.js';

export interface ProceduralSkeletonResult {
  skeleton: Skeleton;
  /**
   * Absolute canvas-space position of each bone (origin = top-left of source
   * image). Used by the exporter to map region-pixel meshes into bone-local
   * space without re-walking the parent chain.
   */
  boneAbs: Record<string, Vec2>;
  /**
   * Where the figure's "root" sits in source-canvas coords. The exporter
   * sets the Enemy Node2D position here; everything is bone-local relative
   * to it.
   */
  rootCanvas: Vec2;
}

interface AbsLayout {
  root: Vec2;
  hip: Vec2;
  spine: Vec2;
  chest: Vec2;
  neck: Vec2;
  head: Vec2;
  l_shoulder: Vec2;
  l_upper_arm: Vec2;
  l_lower_arm: Vec2;
  l_hand: Vec2;
  r_shoulder: Vec2;
  r_upper_arm: Vec2;
  r_lower_arm: Vec2;
  r_hand: Vec2;
  l_upper_leg: Vec2;
  l_lower_leg: Vec2;
  l_foot: Vec2;
  r_upper_leg: Vec2;
  r_lower_leg: Vec2;
  r_foot: Vec2;
}

function buildAbsLayout(L: Landmarks): AbsLayout {
  const cx = L.centerX;
  const armY = L.shoulderY;
  const elbowLx = Math.round((L.shoulderLx + L.wristLx) / 2);
  const elbowRx = Math.round((L.shoulderRx + L.wristRx) / 2);

  // Spine column: hip → chest at shoulderY. Place spine and chest evenly.
  const torsoTop = armY;
  const torsoBot = L.hipY;
  const spineY = Math.round(torsoTop + (torsoBot - torsoTop) * 0.6);
  const chestY = Math.round(torsoTop + (torsoBot - torsoTop) * 0.25);
  const neckY = Math.round((armY + L.head.bottom) / 2);

  const root: Vec2 = { x: cx, y: torsoBot };
  return {
    root,
    hip: { x: cx, y: torsoBot },
    spine: { x: cx, y: spineY },
    chest: { x: cx, y: chestY },
    neck: { x: cx, y: neckY },
    head: L.head.center,
    l_shoulder: { x: L.shoulderLx, y: armY },
    l_upper_arm: { x: L.shoulderLx, y: armY },
    l_lower_arm: { x: elbowLx, y: armY },
    l_hand: { x: L.wristLx, y: armY },
    r_shoulder: { x: L.shoulderRx, y: armY },
    r_upper_arm: { x: L.shoulderRx, y: armY },
    r_lower_arm: { x: elbowRx, y: armY },
    r_hand: { x: L.wristRx, y: armY },
    l_upper_leg: L.legL.hip,
    l_lower_leg: L.legL.knee,
    l_foot: L.legL.ankle,
    r_upper_leg: L.legR.hip,
    r_lower_leg: L.legR.knee,
    r_foot: L.legR.ankle,
  };
}

function dist(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x, dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Build a procedural skeleton with the same bone NAMES as the humanoid
 * template, but with positions/lengths derived from the detected landmarks.
 *
 * Bone rotations are kept at 0 (matching the template) so the existing
 * motion clips (which animate position/rotation by bone name) still work.
 * Phase 4 will add bone rotations aligned with limb directions.
 *
 * Mesh attachments are inherited from the template. The exporter is
 * responsible for mapping region-pixel meshes into bone-local space using
 * the bone's absolute canvas position + the region's source bounds.
 */
export function buildProceduralSkeleton(
  template: TemplateData,
  landmarks: Landmarks,
): ProceduralSkeletonResult {
  const abs = buildAbsLayout(landmarks);

  // Helper: parent-relative position
  const rel = (child: Vec2, parent: Vec2): Vec2 => ({ x: child.x - parent.x, y: child.y - parent.y });

  const boneAbs: Record<string, Vec2> = {
    root: abs.root,
    hip: abs.hip,
    spine: abs.spine,
    chest: abs.chest,
    neck: abs.neck,
    head: abs.head,
    l_shoulder: abs.l_shoulder,
    l_upper_arm: abs.l_upper_arm,
    l_lower_arm: abs.l_lower_arm,
    l_hand: abs.l_hand,
    r_shoulder: abs.r_shoulder,
    r_upper_arm: abs.r_upper_arm,
    r_lower_arm: abs.r_lower_arm,
    r_hand: abs.r_hand,
    l_upper_leg: abs.l_upper_leg,
    l_lower_leg: abs.l_lower_leg,
    l_foot: abs.l_foot,
    r_upper_leg: abs.r_upper_leg,
    r_lower_leg: abs.r_lower_leg,
    r_foot: abs.r_foot,
  };

  const bones: Bone[] = [
    { name: 'root',          parent: null,        position: { x: 0, y: 0 }, rotation: 0, length: 0 },
    { name: 'hip',           parent: 'root',      position: rel(abs.hip, abs.root),         rotation: 0, length: Math.max(8, Math.round(landmarks.torsoHalfWidth)) },

    { name: 'spine',         parent: 'hip',       position: rel(abs.spine, abs.hip),        rotation: 0, length: Math.round(dist(abs.spine, abs.chest)) },
    { name: 'chest',         parent: 'spine',     position: rel(abs.chest, abs.spine),      rotation: 0, length: Math.round(dist(abs.chest, abs.neck)) },
    { name: 'neck',          parent: 'chest',     position: rel(abs.neck, abs.chest),       rotation: 0, length: Math.round(dist(abs.neck, abs.head)) },
    { name: 'head',          parent: 'neck',      position: rel(abs.head, abs.neck),        rotation: 0, length: Math.round(landmarks.head.bottom - landmarks.head.top) },

    { name: 'l_shoulder',    parent: 'chest',     position: rel(abs.l_shoulder, abs.chest), rotation: 0, length: 0 },
    { name: 'l_upper_arm',   parent: 'l_shoulder',position: { x: 0, y: 0 },                  rotation: 0, length: Math.round(dist(abs.l_upper_arm, abs.l_lower_arm)) },
    { name: 'l_lower_arm',   parent: 'l_upper_arm',position: rel(abs.l_lower_arm, abs.l_upper_arm), rotation: 0, length: Math.round(dist(abs.l_lower_arm, abs.l_hand)) },
    { name: 'l_hand',        parent: 'l_lower_arm',position: rel(abs.l_hand, abs.l_lower_arm), rotation: 0, length: 12 },

    { name: 'r_shoulder',    parent: 'chest',     position: rel(abs.r_shoulder, abs.chest), rotation: 0, length: 0 },
    { name: 'r_upper_arm',   parent: 'r_shoulder',position: { x: 0, y: 0 },                  rotation: 0, length: Math.round(dist(abs.r_upper_arm, abs.r_lower_arm)) },
    { name: 'r_lower_arm',   parent: 'r_upper_arm',position: rel(abs.r_lower_arm, abs.r_upper_arm), rotation: 0, length: Math.round(dist(abs.r_lower_arm, abs.r_hand)) },
    { name: 'r_hand',        parent: 'r_lower_arm',position: rel(abs.r_hand, abs.r_lower_arm), rotation: 0, length: 12 },

    { name: 'l_upper_leg',   parent: 'hip',       position: rel(abs.l_upper_leg, abs.hip),  rotation: 0, length: Math.round(dist(abs.l_upper_leg, abs.l_lower_leg)) },
    { name: 'l_lower_leg',   parent: 'l_upper_leg',position: rel(abs.l_lower_leg, abs.l_upper_leg), rotation: 0, length: Math.round(dist(abs.l_lower_leg, abs.l_foot)) },
    { name: 'l_foot',        parent: 'l_lower_leg',position: rel(abs.l_foot, abs.l_lower_leg), rotation: 0, length: 14 },

    { name: 'r_upper_leg',   parent: 'hip',       position: rel(abs.r_upper_leg, abs.hip),  rotation: 0, length: Math.round(dist(abs.r_upper_leg, abs.r_lower_leg)) },
    { name: 'r_lower_leg',   parent: 'r_upper_leg',position: rel(abs.r_lower_leg, abs.r_upper_leg), rotation: 0, length: Math.round(dist(abs.r_lower_leg, abs.r_foot)) },
    { name: 'r_foot',        parent: 'r_lower_leg',position: rel(abs.r_foot, abs.r_lower_leg), rotation: 0, length: 14 },
  ];

  // Mesh attachments stay structurally the same as the template — the
  // exporter recomputes per-mesh bone-local placement from boundsInSource +
  // boneAbs, so the template's halfWidth/halfHeight are unused on this path.
  const meshes: Mesh[] = template.skeleton.meshes.map((m) => ({ ...m }));

  return {
    skeleton: {
      templateId: template.templateId,
      bones,
      meshes,
    },
    boneAbs,
    rootCanvas: abs.root,
  };
}
