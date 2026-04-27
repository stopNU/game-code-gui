import { basename } from 'node:path';
import type { Animation, Bone, Mesh, Skeleton, Vec2, BoneTrack } from '../types/skeleton.js';
import type { EnemySpec } from '../types/enemy-spec.js';
import type { AtlasOutput, RegionMesh } from '../types/visual.js';

/**
 * Godot 4.x .tscn writer.
 *
 * The exported scene tree is:
 *
 *   Node2D "Enemy"
 *     Skeleton2D "Skeleton"
 *       Bone2D "root"
 *         Bone2D "hip"
 *           ...                    (parent-before-child hierarchy)
 *         Polygon2D "<region>_mesh"   (child of its primary bone)
 *         ...
 *     AnimationPlayer "AnimationPlayer"
 *       (idle, attack, hit, death)
 *
 * Two render modes:
 *   - flat-color: each Polygon2D has a `color` property only (Phase 1 / fallback).
 *   - textured:   a shared atlas ExtResource is loaded; each Polygon2D has a
 *                 dynamic mesh (Delaunay triangulated) with UVs into the atlas.
 */

export interface ExportInput {
  spec: EnemySpec;
  skeleton: Skeleton;
  animations: Animation[];
  rootOffset: Vec2;
  /** Region name -> sRGB hex (used only in flat-color mode). */
  regionColors?: Record<string, string>;
  /** When set, exporter renders textured polygons referencing this atlas. */
  atlas?: AtlasOutput;
  /** Per-region triangulated mesh in region-local pixel space. */
  regionMeshes?: RegionMesh[];
  /**
   * Sub-path inside the Godot project where this bundle will live. Used to
   * prefix the atlas ext_resource path. Defaults to "" (atlas at project root).
   * Example: "enemies/cultist" → res://enemies/cultist/enemy.atlas.png.
   */
  bundleSubdir?: string;
}

export interface ExportedScene {
  /** Full text of enemy.tscn. */
  tscn: string;
}

function fmt(n: number): string {
  // Round to 4 decimals to keep .tscn diffs stable.
  if (Number.isInteger(n)) return n.toFixed(0);
  return Number(n.toFixed(4)).toString();
}

function v2(p: Vec2): string {
  return `Vector2(${fmt(p.x)}, ${fmt(p.y)})`;
}

function colorFromHex(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return 'Color(0.5, 0.5, 0.5, 1)';
  const n = parseInt(m[1]!, 16);
  const r = ((n >> 16) & 0xff) / 255;
  const g = ((n >> 8) & 0xff) / 255;
  const b = (n & 0xff) / 255;
  return `Color(${fmt(r)}, ${fmt(g)}, ${fmt(b)}, 1)`;
}

function packedVec2Array(points: Vec2[]): string {
  return `PackedVector2Array(${points.map((p) => `${fmt(p.x)}, ${fmt(p.y)}`).join(', ')})`;
}

function packedFloat32Array(values: number[]): string {
  return `PackedFloat32Array(${values.map(fmt).join(', ')})`;
}

function packedInt32Array(values: number[]): string {
  return `PackedInt32Array(${values.join(', ')})`;
}

function bonePath(bone: Bone, allBones: Bone[]): string {
  // Build "Skeleton/root/hip/spine/..." path from root down to this bone.
  const byName = new Map(allBones.map((b) => [b.name, b]));
  const chain: string[] = [];
  let cur: Bone | undefined = bone;
  while (cur) {
    chain.unshift(cur.name);
    cur = cur.parent ? byName.get(cur.parent) : undefined;
  }
  return `Skeleton/${chain.join('/')}`;
}

/**
 * The path at which a Polygon2D mesh node lives in the scene.
 * Meshes are children of the Skeleton2D root (so animation paths to them
 * are stable regardless of which bone they're skinned to). Skin is
 * expressed via the `skeleton` NodePath property and bone weights.
 */
function meshPath(mesh: Mesh): string {
  return `Skeleton/${mesh.name}`;
}

function indent(level: number, s: string): string {
  return `${' '.repeat(level * 2)}${s}`;
}

function emitBoneNodes(skeleton: Skeleton): string[] {
  const lines: string[] = [];
  const byName = new Map(skeleton.bones.map((b) => [b.name, b]));
  for (const bone of skeleton.bones) {
    const parentPath = bone.parent
      ? bonePath(byName.get(bone.parent)!, skeleton.bones).replace(/^Skeleton\//, '')
      : 'Skeleton';
    const nodeParent = bone.parent
      ? bonePath(byName.get(bone.parent)!, skeleton.bones).replace(/^Skeleton/, 'Skeleton').replace(/^Skeleton\//, 'Skeleton/')
      : 'Skeleton';
    lines.push(`[node name="${bone.name}" type="Bone2D" parent="${nodeParent}"]`);
    lines.push(`position = ${v2(bone.position)}`);
    if (bone.rotation !== 0) lines.push(`rotation = ${fmt(bone.rotation)}`);
    if (bone.length > 0) {
      lines.push(`auto_calculate_length_and_angle = false`);
      lines.push(`length = ${fmt(bone.length)}`);
    }
    lines.push('');
    void parentPath;
  }
  return lines;
}

interface TexturedMeshArgs {
  atlas: AtlasOutput;
  regionMeshes: RegionMesh[];
  atlasResId: string;
}

function emitMeshNodes(
  skeleton: Skeleton,
  regionColors: Record<string, string>,
  textured?: TexturedMeshArgs,
): string[] {
  const lines: string[] = [];
  const meshByRegion = new Map<string, RegionMesh>();
  const rectByRegion = new Map<string, AtlasOutput['rects'][number]>();
  if (textured) {
    for (const m of textured.regionMeshes) meshByRegion.set(m.region, m);
    for (const r of textured.atlas.rects) rectByRegion.set(r.region, r);
  }

  const byName = new Map(skeleton.bones.map((b) => [b.name, b]));
  for (const mesh of skeleton.meshes) {
    const bone = byName.get(mesh.primaryBone);
    if (!bone) {
      throw new Error(`Mesh ${mesh.name} references unknown bone ${mesh.primaryBone}`);
    }
    const parentPath = bonePath(bone, skeleton.bones);

    // Decide rendering: textured if the atlas provides this region AND the
    // mesh stage built triangles for it; otherwise flat color.
    const dynMesh = textured ? meshByRegion.get(mesh.region) : undefined;
    const atlasRect = textured ? rectByRegion.get(mesh.region) : undefined;
    const useTextured = !!(
      dynMesh &&
      atlasRect &&
      textured &&
      atlasRect.w > 0 &&
      atlasRect.h > 0 &&
      dynMesh.vertices.length >= 3 &&
      dynMesh.triangles.length >= 3
    );

    lines.push(`[node name="${mesh.name}_mesh" type="Polygon2D" parent="${parentPath}"]`);
    lines.push(`z_index = ${mesh.zIndex}`);

    if (useTextured && dynMesh && atlasRect && textured) {
      // Map region-local pixel vertices into bone-local space using the
      // template's anchor + half-extents. This preserves Phase 1 layout
      // while replacing geometry with the dynamic Delaunay mesh.
      const tplMesh = mesh; // template Mesh has halfWidth/halfHeight encoded in its vertices
      // Recover the half-extents from the template quad.
      const xs = tplMesh.vertices.map((v) => v.x);
      const ys = tplMesh.vertices.map((v) => v.y);
      const minX = Math.min(...xs), maxX = Math.max(...xs);
      const minY = Math.min(...ys), maxY = Math.max(...ys);
      const halfW = (maxX - minX) / 2;
      const halfH = (maxY - minY) / 2;
      const offsetX = -halfW; // both anchor modes are centered horizontally
      // anchor=center → minY = -halfH; anchor=head → minY = 0.
      const offsetY = minY;

      const dynW = dynMesh.bounds.w + dynMesh.bounds.x; // not used; we use full image dims via UVs
      void dynW;

      // The dynMesh.vertices are in region-local pixel coords (whole region image).
      // Region image dimensions = atlasRect.w/h (we packed at original size).
      const sx = (2 * halfW) / atlasRect.w;
      const sy = (2 * halfH) / atlasRect.h;
      const polygon = dynMesh.vertices.map<Vec2>((v) => ({
        x: offsetX + v.x * sx,
        y: offsetY + v.y * sy,
      }));

      // UVs in atlas pixel coords (Polygon2D `uv` is in texture pixel space).
      const uvs = dynMesh.vertices.map<Vec2>((v) => ({
        x: atlasRect.x + v.x,
        y: atlasRect.y + v.y,
      }));

      // Sub-polygon list = one entry per triangle so Godot doesn't auto-triangulate.
      const triLines: string[] = [];
      for (let t = 0; t < dynMesh.triangles.length; t += 3) {
        triLines.push(`PackedInt32Array(${dynMesh.triangles[t]}, ${dynMesh.triangles[t + 1]}, ${dynMesh.triangles[t + 2]})`);
      }

      lines.push(`texture = ExtResource("${textured.atlasResId}")`);
      lines.push(`polygon = ${packedVec2Array(polygon)}`);
      lines.push(`uv = ${packedVec2Array(uvs)}`);
      lines.push(`polygons = [${triLines.join(', ')}]`);
    } else {
      // Flat-color fallback (Phase 1 path).
      const color = regionColors[mesh.region] ?? '#888888';
      lines.push(`color = ${colorFromHex(color)}`);
      lines.push(`polygon = ${packedVec2Array(mesh.vertices)}`);
    }
    lines.push('');
  }
  return lines;
}

function emitAnimationResource(anim: Animation, skeleton: Skeleton, idPrefix: string): {
  subResource: string;
  id: string;
} {
  const id = `${idPrefix}_${anim.name}`;
  const byName = new Map(skeleton.bones.map((b) => [b.name, b]));
  const lines: string[] = [];
  lines.push(`[sub_resource type="Animation" id="${id}"]`);
  lines.push(`resource_name = "${anim.name}"`);
  lines.push(`length = ${fmt(anim.length)}`);
  lines.push(`loop_mode = ${anim.loop ? 1 : 0}`); // 0 = none, 1 = linear

  let trackIdx = 0;
  for (const track of anim.tracks) {
    const bone = byName.get(track.bone);
    if (!bone) continue;
    const path = `${bonePath(bone, skeleton.bones)}:${propertyPath(track)}`;
    lines.push(`tracks/${trackIdx}/type = "value"`);
    lines.push(`tracks/${trackIdx}/imported = false`);
    lines.push(`tracks/${trackIdx}/enabled = true`);
    lines.push(`tracks/${trackIdx}/path = NodePath("${path}")`);
    lines.push(`tracks/${trackIdx}/interp = 1`); // 1 = linear
    lines.push(`tracks/${trackIdx}/loop_wrap = true`);
    lines.push(`tracks/${trackIdx}/keys = ${formatTrackKeys(track)}`);
    trackIdx += 1;
  }

  return { subResource: lines.join('\n') + '\n', id };
}

function propertyPath(track: BoneTrack): string {
  switch (track.property) {
    case 'position': return 'position';
    case 'rotation': return 'rotation';
    case 'scale': return 'scale';
  }
}

function formatTrackKeys(track: BoneTrack): string {
  // Godot value-track key dict: { times: PackedFloat32Array,
  //                                transitions: PackedFloat32Array,
  //                                update: 0,
  //                                values: [ ... ] }
  const transitions = new Array(track.times.length).fill(1.0);
  const valuesStr = track.values
    .map((v) => {
      if (typeof v === 'number') return fmt(v);
      return v2(v);
    })
    .join(', ');
  return `{
"times": ${packedFloat32Array(track.times)},
"transitions": ${packedFloat32Array(transitions)},
"update": 0,
"values": [${valuesStr}]
}`;
}

export function writeTscn(input: ExportInput): ExportedScene {
  const { skeleton, animations, rootOffset, regionColors, atlas, regionMeshes, spec } = input;
  void packedInt32Array;
  void indent;

  const isTextured = !!(atlas && regionMeshes && regionMeshes.length > 0);
  const colors = regionColors ?? {};

  const subResources: string[] = [];
  const extResources: string[] = [];
  let atlasResId: string | undefined;
  if (isTextured && atlas) {
    atlasResId = `tex_${spec.id}_atlas`;
    const atlasFile = basename(atlas.atlasPath);
    const subdir = (input.bundleSubdir ?? '').replace(/^\/+|\/+$/g, '');
    const atlasResPath = subdir ? `res://${subdir}/${atlasFile}` : `res://${atlasFile}`;
    extResources.push(
      `[ext_resource type="Texture2D" path="${atlasResPath}" id="${atlasResId}"]`,
    );
  }
  const animIds: Record<string, string> = {};
  const animPrefix = `anim_${spec.id}`;
  for (const anim of animations) {
    const r = emitAnimationResource(anim, skeleton, animPrefix);
    subResources.push(r.subResource);
    animIds[anim.name] = r.id;
  }

  // AnimationLibrary sub-resource bundling all clips.
  const libId = `lib_${spec.id}`;
  const libLines: string[] = [];
  libLines.push(`[sub_resource type="AnimationLibrary" id="${libId}"]`);
  // _data property is a Dictionary<StringName, Animation>
  const entries = animations
    .map((a) => `"${a.name}": SubResource("${animIds[a.name]}")`)
    .join(',\n');
  libLines.push(`_data = {\n${entries}\n}`);
  subResources.push(libLines.join('\n') + '\n');

  // load_steps: header value is hint-only (Godot recalculates on load), but
  // setting it close to actual sub-resource count keeps the file tidy.
  const loadSteps = subResources.length + extResources.length + 1;
  const header = `[gd_scene load_steps=${loadSteps} format=3 uid="uid://enemy_${spec.id}"]`;

  // --- Node tree ---
  const nodeLines: string[] = [];

  // Root Enemy node (Node2D) positioned at canvas-relative root offset.
  nodeLines.push(`[node name="Enemy" type="Node2D"]`);
  nodeLines.push(`position = ${v2(rootOffset)}`);
  nodeLines.push('');

  // Skeleton2D
  nodeLines.push(`[node name="Skeleton" type="Skeleton2D" parent="."]`);
  nodeLines.push('');

  // Bones
  nodeLines.push(...emitBoneNodes(skeleton));

  // Polygon2D meshes (parented to their primary bones)
  const texturedArgs = isTextured && atlas && regionMeshes && atlasResId
    ? { atlas, regionMeshes, atlasResId }
    : undefined;
  nodeLines.push(...emitMeshNodes(skeleton, colors, texturedArgs));

  // AnimationPlayer
  nodeLines.push(`[node name="AnimationPlayer" type="AnimationPlayer" parent="."]`);
  nodeLines.push(`libraries = {\n"": SubResource("${libId}")\n}`);
  nodeLines.push('');

  const tscn = [header, '', ...extResources, '', ...subResources, ...nodeLines].join('\n');
  return { tscn };
}
