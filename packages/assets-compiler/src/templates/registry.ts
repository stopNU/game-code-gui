import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Animation, Bone, Mesh, Skeleton, Vec2 } from '../types/skeleton.js';

const HERE = dirname(fileURLToPath(import.meta.url));

interface SkeletonJson {
  templateId: string;
  canvasSize: { width: number; height: number };
  rootOffset: Vec2;
  bones: Bone[];
  meshes: Array<{
    name: string;
    region: string;
    primaryBone: string;
    halfWidth: number;
    halfHeight: number;
    /** "center" = quad centered on bone origin; "head" = quad starts at bone origin and extends along +y. */
    anchor: 'center' | 'head';
    zIndex: number;
  }>;
}

export interface TemplateData {
  templateId: string;
  canvasSize: { width: number; height: number };
  rootOffset: Vec2;
  skeleton: Skeleton;
  animations: Animation[];
}

const MOTION_NAMES = ['idle', 'attack', 'hit', 'death'] as const;

function buildQuadMesh(
  raw: SkeletonJson['meshes'][number],
): Mesh {
  const { halfWidth: hw, halfHeight: hh, anchor } = raw;
  // Vertices in the bone's local frame.
  // anchor=center: quad spans (-hw,-hh)..(hw,hh)
  // anchor=head:   quad spans (-hw, 0)..(hw, 2*hh) — extends along +y from bone head.
  const top = anchor === 'center' ? -hh : 0;
  const bottom = anchor === 'center' ? hh : 2 * hh;
  const vertices: Vec2[] = [
    { x: -hw, y: top },
    { x: hw, y: top },
    { x: hw, y: bottom },
    { x: -hw, y: bottom },
  ];
  const uvs: Vec2[] = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
  ];
  const triangles = [0, 1, 2, 0, 2, 3];
  return {
    name: raw.name,
    region: raw.region,
    vertices,
    uvs,
    triangles,
    primaryBone: raw.primaryBone,
    zIndex: raw.zIndex,
  };
}

/**
 * Resolve a templates dir that works both in source (src/templates) and
 * after `tsc + copy-templates` (dist/templates).
 */
function templatesRoot(): string {
  // import.meta.url points at .../src/templates/registry.ts in dev (tsx)
  //                          .../dist/templates/registry.js in build
  return HERE;
}

export async function loadTemplate(templateId: 'humanoid'): Promise<TemplateData> {
  const root = resolve(templatesRoot(), templateId);
  const skelPath = resolve(root, 'skeleton.json');
  const skelRaw = JSON.parse(await readFile(skelPath, 'utf8')) as SkeletonJson;

  const skeleton: Skeleton = {
    templateId: skelRaw.templateId,
    bones: skelRaw.bones,
    meshes: skelRaw.meshes.map(buildQuadMesh),
  };

  const animations: Animation[] = [];
  for (const name of MOTION_NAMES) {
    const motionPath = resolve(root, 'motions', `${name}.json`);
    const raw = JSON.parse(await readFile(motionPath, 'utf8')) as Animation;
    animations.push(raw);
  }

  return {
    templateId: skelRaw.templateId,
    canvasSize: skelRaw.canvasSize,
    rootOffset: skelRaw.rootOffset,
    skeleton,
    animations,
  };
}
