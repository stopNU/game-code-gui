/**
 * Background removal via Transformers.js (Hugging Face) running RMBG-1.4 in
 * onnxruntime locally. The model is downloaded to ~/.cache/huggingface/ on
 * first use, then reused.
 *
 * Adapter shape lets us swap in a different model (BiRefNet, MobileSAM, etc.)
 * without touching the segment stage.
 */
import sharp from 'sharp';

export interface BgRemovalAdapter {
  readonly id: string;
  /**
   * Read the PNG at `inputPath`, return a buffer for an RGBA PNG with the
   * background removed (alpha = 0 on bg pixels).
   */
  removeBackground(inputPath: string): Promise<Buffer>;
}

/**
 * Default open-license bg-removal model. RMBG-1.4 is a BriaAI gated model
 * (returns 401 without HF auth), so we default to MODNet which is freely
 * downloadable. Override via the RMBG_MODEL env var.
 *
 * Verified open options:
 *   - Xenova/modnet (portrait-tuned, MIT)
 *   - onnx-community/BiRefNet_T-ONNX (general, Apache-2.0; higher quality, larger)
 *
 * To use the gated RMBG-1.4 instead:
 *   1. Visit https://huggingface.co/briaai/RMBG-1.4 and accept the license
 *   2. Set HF_TOKEN=<your-hf-token>
 *   3. Set RMBG_MODEL=briaai/RMBG-1.4
 */
const DEFAULT_RMBG_MODEL = 'Xenova/modnet';

let _pipelineCache: { id: string; pipe: unknown } | null = null;

async function loadPipeline(modelId: string): Promise<unknown> {
  if (_pipelineCache && _pipelineCache.id === modelId) return _pipelineCache.pipe;
  const { pipeline, env } = await import('@huggingface/transformers');
  env.allowLocalModels = true;
  env.allowRemoteModels = true;
  const pipe = await pipeline('image-segmentation', modelId);
  _pipelineCache = { id: modelId, pipe };
  return pipe;
}

export const rmbgAdapter: BgRemovalAdapter = {
  get id() {
    return `huggingface/${process.env['RMBG_MODEL'] ?? DEFAULT_RMBG_MODEL}`;
  },
  async removeBackground(inputPath) {
    const modelId = process.env['RMBG_MODEL'] ?? DEFAULT_RMBG_MODEL;
    type Segmentation = { mask: { data: Uint8Array; width: number; height: number } };
    type SegPipeline = (input: string) => Promise<Segmentation[]>;
    const segmenter = (await loadPipeline(modelId)) as SegPipeline;
    const out = await segmenter(inputPath);
    const first = out?.[0];
    if (!first?.mask) throw new Error('rmbg-1.4 returned no mask');

    // Compose the input image with the mask as alpha.
    const inputMeta = await sharp(inputPath).metadata();
    const { width: imgW, height: imgH } = inputMeta;
    if (!imgW || !imgH) throw new Error('input image has no dimensions');
    const { data: maskData, width: maskW, height: maskH } = first.mask;

    // Resize mask to image dimensions if needed.
    let maskBuf: Buffer = Buffer.from(new Uint8Array(maskData));
    if (maskW !== imgW || maskH !== imgH) {
      maskBuf = await sharp(maskBuf, { raw: { width: maskW, height: maskH, channels: 1 } })
        .resize(imgW, imgH, { fit: 'fill' })
        .raw()
        .toBuffer();
    }

    // Apply mask as alpha channel.
    const rgba = await sharp(inputPath).ensureAlpha().raw().toBuffer();
    if (rgba.length !== imgW * imgH * 4) {
      throw new Error(`input pixel count mismatch: ${rgba.length} vs ${imgW * imgH * 4}`);
    }
    for (let i = 0; i < imgW * imgH; i++) {
      rgba[i * 4 + 3] = maskBuf[i] ?? 0;
    }
    return await sharp(rgba, { raw: { width: imgW, height: imgH, channels: 4 } })
      .png()
      .toBuffer();
  },
};

/**
 * Heuristic alpha-matte adapter — used as a fallback when Transformers.js
 * fails to load (offline first run, model download blocked, etc.). Removes
 * pixels close to the known plain background color from the image-gen prompt.
 */
export const colorKeyAdapter: BgRemovalAdapter = {
  id: 'color-key:lavender',
  async removeBackground(inputPath) {
    const meta = await sharp(inputPath).metadata();
    const { width, height } = meta;
    if (!width || !height) throw new Error('input image has no dimensions');
    const rgba = await sharp(inputPath).ensureAlpha().raw().toBuffer();
    // Background prompt color: #b48dff = (180, 141, 255).
    const tr = 180, tg = 141, tb = 255;
    const tol = 50;
    for (let i = 0; i < width * height; i++) {
      const r = rgba[i * 4]!;
      const g = rgba[i * 4 + 1]!;
      const b = rgba[i * 4 + 2]!;
      const dr = Math.abs(r - tr), dg = Math.abs(g - tg), db = Math.abs(b - tb);
      if (dr < tol && dg < tol && db < tol) {
        rgba[i * 4 + 3] = 0;
      }
    }
    return await sharp(rgba, { raw: { width, height, channels: 4 } })
      .png()
      .toBuffer();
  },
};
