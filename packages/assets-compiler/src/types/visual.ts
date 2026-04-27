import type { Vec2 } from './skeleton.js';

/**
 * Output of the visual stage. Discriminated union: image generation may fail
 * (no FAL_KEY, network error, retries exhausted) and fall back to flat colors.
 * Downstream stages branch on this shape.
 */
export type VisualOutput =
  | {
      kind: 'image';
      /** Path to the generated source PNG on disk (under .compiler/visual/). */
      neutralPath: string;
      width: number;
      height: number;
      /** Provenance, e.g. "fal-ai/flux/schnell" or "placeholder:silhouette". */
      provenance: string;
    }
  | {
      kind: 'flat-colors';
      regionColors: Record<string, string>;
    };

/**
 * Per-region segmentation result.
 *   - `pngPath`: cropped PNG with alpha (background removed) for this region
 *   - `boundsInSource`: rect inside the source image this region was cut from
 *   - `size`: pixel dimensions of `pngPath`
 *   - `coveragePx`: count of opaque pixels (used by part-coverage evaluator)
 */
export interface RegionSegmentation {
  region: string;
  pngPath: string;
  boundsInSource: { x: number; y: number; w: number; h: number };
  size: { w: number; h: number };
  coveragePx: number;
}

export interface SegmentOutput {
  /** Path to the bg-removed full image (for evaluators / debug). */
  cutoutPath: string;
  regions: RegionSegmentation[];
  /**
   * Per-region average opaque-pixel color in `#rrggbb`. Regions with no
   * coverage get the body fallback color. The exporter uses these for
   * regions where the textured render path can't run (empty mesh, missing
   * atlas rect), instead of a hard-coded gray.
   */
  fallbackColors: Record<string, string>;
}

/**
 * A built mesh for one region. Vertices are in *region-local* pixel space
 * (origin at top-left of the region's PNG). UVs are in [0, 1] relative to
 * the region's PNG. The atlas-pack stage remaps UVs to atlas coordinates.
 */
export interface RegionMesh {
  region: string;
  vertices: Vec2[];
  uvs: Vec2[];
  triangles: number[];
  /** Bounding box of the alpha-opaque region in local pixels. */
  bounds: { x: number; y: number; w: number; h: number };
  /** Number of vertices that lie on the alpha boundary. */
  boundaryVertexCount: number;
}

export interface MeshStageOutput {
  meshes: RegionMesh[];
}

/** Per-region rect inside the packed atlas image. */
export interface AtlasRect {
  region: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface AtlasOutput {
  /** Path to the packed atlas PNG. */
  atlasPath: string;
  width: number;
  height: number;
  rects: AtlasRect[];
}
