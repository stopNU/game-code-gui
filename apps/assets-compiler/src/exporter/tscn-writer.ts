import type { Animation, Bone, Mesh, Skeleton, Vec2, BoneTrack } from '../types/skeleton.js';
import type { EnemySpec } from '../types/enemy-spec.js';

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
 *         Polygon2D "head"          (child of its primary bone, flat-colored)
 *         ...
 *     AnimationPlayer "AnimationPlayer"
 *       (idle, attack, hit, death)
 *
 * Phase 1 uses flat-colored Polygon2D (no textures). Phase 2 will add an
 * AtlasTexture per region and pack textures.
 */

export interface ExportInput {
  spec: EnemySpec;
  skeleton: Skeleton;
  animations: Animation[];
  rootOffset: Vec2;
  /** Region name -> sRGB hex (e.g. "#a8b0b8") from the visual stub stage. */
  regionColors: Record<string, string>;
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

function emitMeshNodes(skeleton: Skeleton, regionColors: Record<string, string>): string[] {
  const lines: string[] = [];
  for (const mesh of skeleton.meshes) {
    // Polygon2D as a child of Skeleton (so AnimationPlayer paths are stable).
    // We position the mesh node at the bone's world position via remote_path,
    // but Phase 1 uses a simpler approach: parent the Polygon2D directly to
    // the driving bone so it inherits its transform automatically.
    // The driving bone's full path:
    const byName = new Map(skeleton.bones.map((b) => [b.name, b]));
    const bone = byName.get(mesh.primaryBone);
    if (!bone) {
      throw new Error(`Mesh ${mesh.name} references unknown bone ${mesh.primaryBone}`);
    }
    const parentPath = bonePath(bone, skeleton.bones);
    const color = regionColors[mesh.region] ?? '#888888';
    lines.push(`[node name="${mesh.name}_mesh" type="Polygon2D" parent="${parentPath}"]`);
    lines.push(`z_index = ${mesh.zIndex}`);
    lines.push(`color = ${colorFromHex(color)}`);
    lines.push(`polygon = ${packedVec2Array(mesh.vertices)}`);
    if (mesh.triangles.length > 0) {
      // Godot's Polygon2D triangulates concave shapes automatically; for our
      // simple convex quads the explicit indices aren't strictly needed.
      // We omit `polygons` (sub-polygon list) and let Godot triangulate.
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
  const { skeleton, animations, rootOffset, regionColors, spec } = input;
  void packedInt32Array;
  void indent;

  const subResources: string[] = [];
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
  const loadSteps = subResources.length + 1;
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
  nodeLines.push(...emitMeshNodes(skeleton, regionColors));

  // AnimationPlayer
  nodeLines.push(`[node name="AnimationPlayer" type="AnimationPlayer" parent="."]`);
  nodeLines.push(`libraries = {\n"": SubResource("${libId}")\n}`);
  nodeLines.push('');

  const tscn = [header, '', ...subResources, ...nodeLines].join('\n');
  return { tscn };
}
