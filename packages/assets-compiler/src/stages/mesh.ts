import sharp from 'sharp';
import Delaunator from 'delaunator';
import type { Stage } from '../orchestrator/stage-runner.js';
import type { Vec2 } from '../types/skeleton.js';
import type { SegmentOutput, MeshStageOutput, RegionMesh } from '../types/visual.js';

export interface MeshStageConfig {
  /** Approximate target vertices per region. Actual count depends on region size + alpha shape. */
  targetVertsPerRegion: number;
  /** Alpha threshold (0-255) above which a pixel counts as opaque. */
  alphaThreshold: number;
}

const DEFAULT_CONFIG: MeshStageConfig = {
  targetVertsPerRegion: 36,
  alphaThreshold: 32,
};

export function createMeshStage(config: MeshStageConfig = DEFAULT_CONFIG): Stage<SegmentOutput, MeshStageOutput> {
  return {
    name: 'mesh',
    async run(seg, ctx) {
      const meshes: RegionMesh[] = [];
      let issuesCount = 0;
      for (const r of seg.regions) {
        if (r.coveragePx === 0) continue;
        const m = await buildRegionMesh(r.region, r.pngPath, config);
        if (m === null) {
          issuesCount += 1;
          continue;
        }
        meshes.push(m);
      }
      await ctx.graph.writeJson('mesh', 'meshes.json', meshes);
      const expected = seg.regions.filter((r) => r.coveragePx > 0).length;
      const score = expected === 0 ? 0 : meshes.length / expected;
      const issues = issuesCount > 0
        ? [{ severity: 'warn' as const, message: `${issuesCount} region(s) failed mesh build` }]
        : [];
      return { output: { meshes }, score, issues };
    },
  };
}

export const meshStage = createMeshStage();

async function buildRegionMesh(
  region: string,
  pngPath: string,
  config: MeshStageConfig,
): Promise<RegionMesh | null> {
  const meta = await sharp(pngPath).metadata();
  const W = meta.width ?? 0;
  const H = meta.height ?? 0;
  if (W < 4 || H < 4) return null;

  const raw = await sharp(pngPath).ensureAlpha().raw().toBuffer();
  const alphaAt = (x: number, y: number): number => {
    if (x < 0 || y < 0 || x >= W || y >= H) return 0;
    return raw[(y * W + x) * 4 + 3] ?? 0;
  };
  const opaque = (x: number, y: number) => alphaAt(x, y) >= config.alphaThreshold;

  // Tight bounding box of alpha-opaque pixels.
  let minX = W, minY = H, maxX = -1, maxY = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (opaque(x, y)) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null; // no opaque pixels

  // Inflate slightly so the boundary doesn't clip vertex placement.
  minX = Math.max(0, minX - 1);
  minY = Math.max(0, minY - 1);
  maxX = Math.min(W - 1, maxX + 1);
  maxY = Math.min(H - 1, maxY + 1);
  const bw = maxX - minX + 1;
  const bh = maxY - minY + 1;

  // Pick a grid spacing that yields ~targetVertsPerRegion interior points
  // assuming roughly half the bbox is opaque on average.
  const targetCells = Math.max(9, config.targetVertsPerRegion);
  const aspect = bw / bh;
  let gx = Math.max(2, Math.round(Math.sqrt(targetCells * aspect)));
  let gy = Math.max(2, Math.round(Math.sqrt(targetCells / aspect)));
  // Clamp to avoid runaway counts.
  gx = Math.min(gx, 8);
  gy = Math.min(gy, 12);

  const points: Vec2[] = [];
  const isBoundary: boolean[] = [];

  // Grid points clipped to alpha-opaque pixels.
  for (let iy = 0; iy <= gy; iy++) {
    for (let ix = 0; ix <= gx; ix++) {
      const x = Math.round(minX + (ix * bw) / gx);
      const y = Math.round(minY + (iy * bh) / gy);
      if (opaque(x, y)) {
        points.push({ x, y });
        isBoundary.push(false);
      }
    }
  }

  // Boundary samples: walk the bounding box perimeter at coarse step and
  // for each ray, find first/last opaque pixel along that axis.
  const boundarySamples = Math.max(8, Math.floor(Math.max(bw, bh) / 12));
  for (let i = 0; i <= boundarySamples; i++) {
    const t = i / boundarySamples;
    // Top + bottom: scan vertically for opaque
    const xCol = Math.round(minX + t * bw);
    let topY = -1, botY = -1;
    for (let y = minY; y <= maxY; y++) {
      if (opaque(xCol, y)) { topY = y; break; }
    }
    for (let y = maxY; y >= minY; y--) {
      if (opaque(xCol, y)) { botY = y; break; }
    }
    if (topY >= 0) { points.push({ x: xCol, y: topY }); isBoundary.push(true); }
    if (botY >= 0 && botY !== topY) { points.push({ x: xCol, y: botY }); isBoundary.push(true); }

    // Left + right: scan horizontally
    const yRow = Math.round(minY + t * bh);
    let leftX = -1, rightX = -1;
    for (let x = minX; x <= maxX; x++) {
      if (opaque(x, yRow)) { leftX = x; break; }
    }
    for (let x = maxX; x >= minX; x--) {
      if (opaque(x, yRow)) { rightX = x; break; }
    }
    if (leftX >= 0) { points.push({ x: leftX, y: yRow }); isBoundary.push(true); }
    if (rightX >= 0 && rightX !== leftX) { points.push({ x: rightX, y: yRow }); isBoundary.push(true); }
  }

  if (points.length < 3) return null;

  // Deduplicate (Delaunator chokes on coincident points).
  const seen = new Set<string>();
  const uniq: Vec2[] = [];
  const uniqBoundary: boolean[] = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    const key = `${p.x},${p.y}`;
    if (seen.has(key)) continue;
    seen.add(key);
    uniq.push(p);
    uniqBoundary.push(isBoundary[i] ?? false);
  }
  if (uniq.length < 3) return null;

  // Triangulate.
  const flat = new Float64Array(uniq.length * 2);
  for (let i = 0; i < uniq.length; i++) {
    flat[i * 2] = uniq[i]!.x;
    flat[i * 2 + 1] = uniq[i]!.y;
  }
  const d = new Delaunator(flat);
  const tris: number[] = [];
  // Filter triangles whose centroid is outside the alpha mask, OR whose
  // signed area is below a sanity threshold (degenerate / collinear).
  // Godot's Polygon2D triangulator throws affine_invert errors on degenerate
  // triangles, so we drop them aggressively here.
  const MIN_TRI_AREA = 1.0;
  for (let t = 0; t < d.triangles.length; t += 3) {
    const a = d.triangles[t]!;
    const b = d.triangles[t + 1]!;
    const c = d.triangles[t + 2]!;
    const va = uniq[a]!, vb = uniq[b]!, vc = uniq[c]!;
    const area2 = Math.abs((vb.x - va.x) * (vc.y - va.y) - (vc.x - va.x) * (vb.y - va.y));
    if (area2 < MIN_TRI_AREA) continue;
    const cx = (va.x + vb.x + vc.x) / 3;
    const cy = (va.y + vb.y + vc.y) / 3;
    if (opaque(Math.round(cx), Math.round(cy))) {
      tris.push(a, b, c);
    }
  }
  if (tris.length < 3) return null;

  // Drop any vertex that no surviving triangle references — leftover boundary
  // points that didn't make it into a valid triangle can collapse to a line
  // (zero-area shape) which also triggers affine_invert in Godot.
  const usedIdx = new Set(tris);
  const remap = new Map<number, number>();
  const compactVerts: Vec2[] = [];
  for (const oldIdx of usedIdx) {
    remap.set(oldIdx, compactVerts.length);
    compactVerts.push(uniq[oldIdx]!);
  }
  const compactTris: number[] = [];
  for (const i of tris) compactTris.push(remap.get(i)!);
  const compactBoundary = compactVerts.length;
  // Recompute the alpha-tight bounding box from the surviving vertices, in
  // case vertex pruning shrank the geometry significantly.
  let cMinX = Infinity, cMinY = Infinity, cMaxX = -Infinity, cMaxY = -Infinity;
  for (const v of compactVerts) {
    if (v.x < cMinX) cMinX = v.x;
    if (v.y < cMinY) cMinY = v.y;
    if (v.x > cMaxX) cMaxX = v.x;
    if (v.y > cMaxY) cMaxY = v.y;
  }
  if (!isFinite(cMinX) || cMaxX - cMinX < 1 || cMaxY - cMinY < 1) return null;

  // UVs in [0,1] relative to the region's PNG.
  const compactUvs: Vec2[] = compactVerts.map((p) => ({ x: p.x / W, y: p.y / H }));

  return {
    region,
    vertices: compactVerts,
    uvs: compactUvs,
    triangles: compactTris,
    bounds: { x: cMinX, y: cMinY, w: cMaxX - cMinX, h: cMaxY - cMinY },
    boundaryVertexCount: compactBoundary,
  };
}
