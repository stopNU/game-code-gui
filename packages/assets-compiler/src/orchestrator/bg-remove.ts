import { resolve } from 'node:path';
import sharp from 'sharp';
import { rmbgAdapter, colorKeyAdapter } from '../adapters/segmenter.js';
import type { AssetGraph } from './asset-graph.js';

/**
 * Bg-removal step. Tries the configured RMBG adapter first and falls back
 * to a heuristic color-key matte on failure (offline first run, model
 * download blocked, etc).
 *
 * Output:
 *   - `<bundle>/.compiler/bg-remove/cutout.png`
 */
export async function removeBackground(
  graph: AssetGraph,
  inputPath: string,
): Promise<{ cutoutPath: string; adapter: string; primaryFailure?: string }> {
  const dir = await graph.ensureStageDir('bg-remove');
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
