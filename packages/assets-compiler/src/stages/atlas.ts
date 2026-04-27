import { resolve } from 'node:path';
import sharp from 'sharp';
import { MaxRectsPacker } from 'maxrects-packer';
import type { Stage } from '../orchestrator/stage-runner.js';
import type { SegmentOutput, AtlasOutput, AtlasRect } from '../types/visual.js';

export interface AtlasStageConfig {
  /** Padding (px) added around each region in the atlas to avoid bleed. */
  padding: number;
  /** Max atlas dimension in either axis. */
  maxSize: number;
  /** Atlas filename (relative to bundle dir). */
  outputName: string;
}

const DEFAULT_CONFIG: AtlasStageConfig = {
  padding: 2,
  maxSize: 2048,
  outputName: 'enemy.atlas.png',
};

export function createAtlasStage(config: AtlasStageConfig = DEFAULT_CONFIG): Stage<SegmentOutput, AtlasOutput> {
  return {
    name: 'atlas',
    async run(seg, ctx) {
      const usable = seg.regions.filter((r) => r.coveragePx > 0 && r.size.w > 0 && r.size.h > 0);
      if (usable.length === 0) {
        throw new Error('atlas: no usable regions to pack');
      }

      const packer = new MaxRectsPacker(config.maxSize, config.maxSize, config.padding, {
        smart: true,
        pot: true,
        square: false,
        allowRotation: false,
      });
      type Entry = { region: string; pngPath: string; w: number; h: number };
      for (const r of usable) {
        const entry: Entry = {
          region: r.region,
          pngPath: r.pngPath,
          w: r.size.w,
          h: r.size.h,
        };
        packer.add(entry.w, entry.h, entry);
      }

      // We expect a single bin given typical region sizes; bail if multiple.
      if (packer.bins.length === 0) throw new Error('atlas: packer produced no bins');
      if (packer.bins.length > 1) {
        throw new Error(`atlas: regions did not fit in a single ${config.maxSize}x${config.maxSize} atlas`);
      }
      const bin = packer.bins[0]!;
      const atlasW = nextPowerOf2(bin.width);
      const atlasH = nextPowerOf2(bin.height);

      // Compose the atlas image.
      const composites: Array<{ input: string; left: number; top: number }> = [];
      const rects: AtlasRect[] = [];
      for (const r of bin.rects) {
        const e = r.data as Entry;
        composites.push({ input: e.pngPath, left: r.x, top: r.y });
        rects.push({ region: e.region, x: r.x, y: r.y, w: e.w, h: e.h });
      }
      const atlasPath = await ctx.graph.writeBundleFile(config.outputName, Buffer.from([])); // placeholder path; overwrite next
      // Write via sharp to ensure the file is a real PNG and not the empty placeholder.
      await sharp({
        create: {
          width: atlasW,
          height: atlasH,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        },
      })
        .composite(composites)
        .png()
        .toFile(atlasPath);

      const out: AtlasOutput = { atlasPath, width: atlasW, height: atlasH, rects };
      await ctx.graph.writeJson('atlas', 'output.json', out);
      return { output: out, score: 1.0 };
    },
  };
}

export const atlasStage = createAtlasStage();

function nextPowerOf2(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

void resolve;
