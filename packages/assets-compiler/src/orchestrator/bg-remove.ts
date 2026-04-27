import { resolve } from 'node:path';
import sharp from 'sharp';
import { rmbgAdapter, colorKeyAdapter } from '../adapters/segmenter.js';
import type { AssetGraph } from './asset-graph.js';

/**
 * Tiny helper used by the orchestrator to do bg-removal once, before both
 * the rig stage (needs the cutout for landmark detection) and the segment
 * stage (needs it to crop regions). Mirrors the segment stage's adapter
 * selection + fallback so behavior stays consistent.
 *
 * Output:
 *   - `<bundle>/.compiler/segment/cutout.png` (so the segment stage's
 *      precutPath can point at it)
 */
export async function removeBackground(
  graph: AssetGraph,
  inputPath: string,
): Promise<{ cutoutPath: string; adapter: string; primaryFailure?: string }> {
  const dir = await graph.ensureStageDir('segment');
  const cutoutPath = resolve(dir, 'cutout.png');

  const envOverride = process.env['ASSETS_COMPILER_BG_REMOVAL'] === 'color-key'
    ? colorKeyAdapter
    : undefined;
  const primary = envOverride ?? rmbgAdapter;
  let buf: Buffer;
  let adapterId = primary.id;
  let primaryFailure: string | undefined;
  try {
    buf = await primary.removeBackground(inputPath);
  } catch (err) {
    primaryFailure = err instanceof Error ? (err.stack ?? err.message) : String(err);
    adapterId = colorKeyAdapter.id;
    buf = await colorKeyAdapter.removeBackground(inputPath);
  }
  await sharp(buf).png().toFile(cutoutPath);
  return primaryFailure
    ? { cutoutPath, adapter: adapterId, primaryFailure }
    : { cutoutPath, adapter: adapterId };
}
