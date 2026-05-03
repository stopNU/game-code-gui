import sharp from 'sharp';

const ALPHA_THRESHOLD = 32;

export interface CutoutAnchor {
  width: number;
  height: number;
  /** Y of the lowest opaque row (inclusive). -1 when the cutout is entirely transparent. */
  footY: number;
}

/**
 * Read a bg-removed PNG and find the figure's foot — the lowest opaque row.
 * Used by the exporter to position the Sprite2D so its parent Node2D's origin
 * sits at the foot-center, letting consumers plant the enemy on a floor Y
 * without knowing the sprite's pixel dimensions.
 *
 * Falls back to `height - 1` (image bottom) when the cutout has no opaque
 * pixels, which keeps the exported scene valid even on a degenerate input.
 */
export async function measureCutoutAnchor(cutoutPath: string): Promise<CutoutAnchor> {
  const meta = await sharp(cutoutPath).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (width === 0 || height === 0) {
    return { width, height, footY: -1 };
  }
  const raw = await sharp(cutoutPath).ensureAlpha().raw().toBuffer();
  for (let y = height - 1; y >= 0; y--) {
    for (let x = 0; x < width; x++) {
      if ((raw[(y * width + x) * 4 + 3] ?? 0) >= ALPHA_THRESHOLD) {
        return { width, height, footY: y };
      }
    }
  }
  return { width, height, footY: height - 1 };
}
