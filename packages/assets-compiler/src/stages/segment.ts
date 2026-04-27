import { resolve } from 'node:path';
import sharp from 'sharp';
import type { Stage } from '../orchestrator/stage-runner.js';
import type { EnemySpec } from '../types/enemy-spec.js';
import type { VisualOutput, SegmentOutput, RegionSegmentation } from '../types/visual.js';
import { rmbgAdapter, colorKeyAdapter, type BgRemovalAdapter } from '../adapters/segmenter.js';
import { loadTemplate, type RegionRect } from '../templates/registry.js';

export interface SegmentStageInput {
  spec: EnemySpec;
  visual: VisualOutput;
  /**
   * Override the template's region rects with landmark-derived dynamic ones
   * (Phase 3 procedural rig). When omitted, falls back to the template's
   * fixed proportional rects.
   */
  regionsOverride?: RegionRect[];
  /**
   * When set, skip bg-removal entirely and crop regions from this cutout.
   * The orchestrator passes this in when the rig stage already removed the
   * background to feed landmark detection (Phase 3).
   */
  precutPath?: string;
}

export interface SegmentStageConfig {
  adapter?: BgRemovalAdapter;
  /** When true, fall back to color-key on adapter error. Default: true. */
  allowFallback?: boolean;
}

export function createSegmentStage(config: SegmentStageConfig = {}): Stage<SegmentStageInput, SegmentOutput> {
  const allowFallback = config.allowFallback !== false;
  return {
    name: 'segment',
    async run({ spec, visual, regionsOverride, precutPath }, ctx) {
      if (visual.kind !== 'image') {
        throw new Error('segment stage requires kind=image visual output');
      }

      const dir = await ctx.graph.ensureStageDir('segment');
      const template = await loadTemplate(spec.templateId);
      const inputRects = regionsOverride ?? template.regions;

      let usedAdapter: string;
      let primaryFailure: string | undefined;
      let cutout: Buffer;
      let cutoutPath: string;
      if (precutPath) {
        cutoutPath = precutPath;
        cutout = await sharp(precutPath).png().toBuffer();
        usedAdapter = 'precut';
      } else {
        // Background removal. Allow tests/CI to force the color-key adapter
        // via ASSETS_COMPILER_BG_REMOVAL=color-key (avoids RMBG model download).
        const envOverride = process.env['ASSETS_COMPILER_BG_REMOVAL'] === 'color-key'
          ? colorKeyAdapter
          : undefined;
        const adapter = config.adapter ?? envOverride ?? rmbgAdapter;
        usedAdapter = adapter.id;
        try {
          cutout = await adapter.removeBackground(visual.neutralPath);
        } catch (err) {
          if (!allowFallback) throw err;
          primaryFailure = err instanceof Error ? (err.stack ?? err.message) : String(err);
          usedAdapter = colorKeyAdapter.id;
          cutout = await colorKeyAdapter.removeBackground(visual.neutralPath);
        }
        cutoutPath = resolve(dir, 'cutout.png');
        await sharp(cutout).png().toFile(cutoutPath);
      }

      // Crop each region. We extract from the cutout (so the alpha is already
      // applied) using the template's proportional rects scaled to image size.
      const W = visual.width;
      const H = visual.height;
      const regions: RegionSegmentation[] = [];
      const regionAvgColor: Record<string, string> = {};
      for (const r of inputRects) {
        const x = Math.max(0, Math.floor(r.x * W));
        const y = Math.max(0, Math.floor(r.y * H));
        const w = Math.min(W - x, Math.ceil(r.w * W));
        const h = Math.min(H - y, Math.ceil(r.h * H));
        if (w <= 0 || h <= 0) continue;

        const cropBuf = await sharp(cutout)
          .extract({ left: x, top: y, width: w, height: h })
          .png()
          .toBuffer();

        // Count opaque pixels + accumulate average color over them.
        const raw = await sharp(cropBuf).raw().toBuffer();
        let coverage = 0;
        let sumR = 0, sumG = 0, sumB = 0;
        for (let i = 0; i < raw.length; i += 4) {
          if (raw[i + 3]! > 8) {
            coverage += 1;
            sumR += raw[i]!;
            sumG += raw[i + 1]!;
            sumB += raw[i + 2]!;
          }
        }
        if (coverage > 0) {
          regionAvgColor[r.id] = rgbToHex(sumR / coverage, sumG / coverage, sumB / coverage);
        }

        const pngPath = resolve(dir, `${r.id}.png`);
        await sharp(cropBuf).png().toFile(pngPath);
        regions.push({
          region: r.id,
          pngPath,
          boundsInSource: { x, y, w, h },
          size: { w, h },
          coveragePx: coverage,
        });
      }

      // Body fallback: prefer torso → hip → average of all collected colors.
      // Used for regions whose template rect missed the figure (e.g. hands at
      // canvas edges when FAL didn't fully extend the arms).
      const bodyFallback = regionAvgColor['torso']
        ?? regionAvgColor['hip']
        ?? averageOf(Object.values(regionAvgColor))
        ?? '#6a5a4a';
      const fallbackColors: Record<string, string> = {};
      for (const r of inputRects) {
        fallbackColors[r.id] = regionAvgColor[r.id] ?? bodyFallback;
      }

      const out: SegmentOutput = { cutoutPath, regions, fallbackColors };
      await ctx.graph.writeJson('segment', 'output.json', {
        ...out,
        adapter: usedAdapter,
        ...(primaryFailure ? { primaryFailure } : {}),
      });

      // Score: ratio of regions that have any coverage. The dedicated
      // part-coverage evaluator runs after this and re-scores more strictly.
      const haveAny = regions.filter((r) => r.coveragePx > 0).length;
      const score = inputRects.length === 0 ? 1 : haveAny / inputRects.length;
      const issues: Array<{ severity: 'warn'; message: string }> = [];
      if (haveAny < inputRects.length) {
        issues.push({
          severity: 'warn',
          message: `${inputRects.length - haveAny}/${inputRects.length} regions have no coverage`,
        });
      }
      if (primaryFailure) {
        // Surface the error so users see why we fell back.
        const oneLine = primaryFailure.split('\n')[0]!.trim();
        issues.push({
          severity: 'warn',
          message: `bg-removal failed → fell back to ${colorKeyAdapter.id}: ${oneLine}`,
        });
      }
      return { output: out, score, issues };
    },
  };
}

export const segmentStage = createSegmentStage();

function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

function averageOf(hexes: string[]): string | undefined {
  if (hexes.length === 0) return undefined;
  let r = 0, g = 0, b = 0;
  for (const h of hexes) {
    const m = /^#?([0-9a-f]{6})$/i.exec(h);
    if (!m) continue;
    const n = parseInt(m[1]!, 16);
    r += (n >> 16) & 0xff;
    g += (n >> 8) & 0xff;
    b += n & 0xff;
  }
  return rgbToHex(r / hexes.length, g / hexes.length, b / hexes.length);
}
