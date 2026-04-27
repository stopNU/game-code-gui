/**
 * Engine-agnostic skeletal types. The Godot exporter converts these to
 * Skeleton2D + Polygon2D + AnimationPlayer; future engine targets reuse
 * the same structure.
 */

export interface Vec2 {
  x: number;
  y: number;
}

export interface Bone {
  /** Stable name. Must be unique within the skeleton. */
  name: string;
  /** Parent bone name, or null for the root. */
  parent: string | null;
  /** Rest position relative to parent. */
  position: Vec2;
  /** Rest rotation in radians, relative to parent. */
  rotation: number;
  /** Length of the bone (for visualization + IK; not strictly required). */
  length: number;
}

/**
 * A textured mesh deformed by one or more bones.
 * Phase 1 ships with simple quad meshes (4 verts) per part bound to a single bone.
 */
export interface Mesh {
  /** Stable name. Used as the Polygon2D node name in Godot. */
  name: string;
  /** Region key inside the atlas (e.g. "head", "torso", "l_upper_arm"). */
  region: string;
  /** Polygon vertices in local space (parent = primary bone). */
  vertices: Vec2[];
  /** UV coordinates per vertex, in [0, 1] relative to the part texture. */
  uvs: Vec2[];
  /** Triangle indices into vertices (groups of 3). */
  triangles: number[];
  /** Primary bone driving this mesh (Phase 1: single bone per mesh). */
  primaryBone: string;
  /** Z-order for draw sorting; higher draws on top. */
  zIndex: number;
}

export interface Skeleton {
  /** Template id this skeleton was built from. */
  templateId: string;
  /** Bone hierarchy. Order is parent-before-child. */
  bones: Bone[];
  /** Mesh attachments. */
  meshes: Mesh[];
}

/**
 * A keyframe track on a single bone's transform component.
 * Phase 1 supports linear interpolation only.
 */
export interface BoneTrack {
  bone: string;
  property: 'position' | 'rotation' | 'scale';
  /** Time in seconds, monotonically increasing. */
  times: number[];
  /** For position/scale: Vec2 per keyframe. For rotation: radians per keyframe. */
  values: Array<Vec2 | number>;
}

export interface Animation {
  name: string;
  /** Duration in seconds. */
  length: number;
  /** Whether the animation loops by default (idle = true; attack/hit/death = false). */
  loop: boolean;
  tracks: BoneTrack[];
}
