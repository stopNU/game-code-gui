import { writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import type { AssetRequest, AssetGenerationResult } from '../types/asset.js';

/**
 * Generate an image via FAL.ai (FLUX/schnell).
 * Requires FAL_KEY env var. Throws if the key is absent or the request fails —
 * callers should catch and fall back to generatePlaceholder.
 */
export async function generateWithFal(
  request: AssetRequest,
  outputDir: string,
): Promise<AssetGenerationResult> {
  const apiKey = process.env['FAL_KEY'];
  if (!apiKey) throw new Error('FAL_KEY env var not set');

  const { fal } = await import('@fal-ai/client');
  fal.config({ credentials: apiKey });

  const w = request.width ?? 512;
  const h = request.height ?? 512;

  const stylePrefix = request.styleGuide
    ? `${request.styleGuide}, `
    : 'fantasy card game art, painterly illustration, dark atmospheric, ';

  const result = await fal.subscribe('fal-ai/flux/schnell', {
    input: {
      prompt: stylePrefix + request.prompt,
      image_size: { width: w, height: h },
      num_inference_steps: 4,
      num_images: 1,
    },
  }) as { data: { images: Array<{ url: string }> } };

  const imageUrl = result.data?.images?.[0]?.url;
  if (!imageUrl) throw new Error('FAL returned no image URL');

  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error(`Failed to download image: HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());

  const filename = `${request.key}.png`;
  const outputPath = join(outputDir, filename);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, buffer);

  return {
    request,
    outputPath,
    status: 'generated',
    qualityScore: 7,
    provenance: 'fal-ai/flux/schnell',
  };
}
