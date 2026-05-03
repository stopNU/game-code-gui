import type { EnemySpec } from '../types/enemy-spec.js';

/**
 * Godot 4.x .tscn writer. Emits a minimal static-sprite scene:
 *
 *   Node2D "Enemy"          (origin = foot-center of the figure)
 *     Sprite2D "Sprite"     (centered = false, offset positions sprite so
 *                            (W/2, footY) maps to parent origin)
 *     Marker2D "GroundAnchor" at (0, 0) — explicit hook for consumers
 *
 * Animation, segmentation, and skeleton concepts have been removed; the
 * pipeline now ships one bg-removed PNG per enemy.
 */

export interface ExportInput {
  spec: EnemySpec;
  /** Filename of the sprite PNG inside the bundle (e.g. "enemy.png"). */
  spriteFilename: string;
  /** Sprite pixel dimensions (used to compute the foot-center offset). */
  spriteWidth: number;
  spriteHeight: number;
  /** Y of the lowest opaque row. When -1, falls back to spriteHeight. */
  footY: number;
  /**
   * Sub-path inside the consuming Godot project where this bundle will live.
   * Used to prefix the sprite ext_resource path.
   * Example: "enemies/cultist" → res://enemies/cultist/enemy.png
   */
  bundleSubdir?: string;
}

export interface ExportedScene {
  /** Full text of enemy.tscn. */
  tscn: string;
}

function fmt(n: number): string {
  if (Number.isInteger(n)) return n.toFixed(0);
  return Number(n.toFixed(4)).toString();
}

export function writeTscn(input: ExportInput): ExportedScene {
  const { spec, spriteFilename, spriteWidth, spriteHeight, footY, bundleSubdir } = input;
  const subdir = (bundleSubdir ?? '').replace(/^\/+|\/+$/g, '');
  const spriteResPath = subdir ? `res://${subdir}/${spriteFilename}` : `res://${spriteFilename}`;
  const spriteResId = `tex_${spec.id}`;

  // Foot-center anchor: sprite's bottom-most opaque pixel maps to parent
  // origin. With centered=false the sprite is drawn in [offset.x, offset.x+W]
  // × [offset.y, offset.y+H]; we want the bottom-center of the figure (W/2,
  // footY) to land at (0, 0).
  const safeFootY = footY >= 0 ? footY : spriteHeight;
  const offsetX = -spriteWidth / 2;
  const offsetY = -safeFootY;

  const lines: string[] = [];
  lines.push(`[gd_scene load_steps=2 format=3 uid="uid://enemy_${spec.id}"]`);
  lines.push('');
  lines.push(`[ext_resource type="Texture2D" path="${spriteResPath}" id="${spriteResId}"]`);
  lines.push('');
  lines.push(`[node name="Enemy" type="Node2D"]`);
  lines.push('');
  lines.push(`[node name="Sprite" type="Sprite2D" parent="."]`);
  lines.push(`texture = ExtResource("${spriteResId}")`);
  lines.push(`centered = false`);
  lines.push(`offset = Vector2(${fmt(offsetX)}, ${fmt(offsetY)})`);
  lines.push('');
  lines.push(`[node name="GroundAnchor" type="Marker2D" parent="."]`);
  lines.push('');

  return { tscn: lines.join('\n') };
}
