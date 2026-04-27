import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { EnemySpec } from '../types/enemy-spec.js';

export interface ImageGenRequest {
  spec: EnemySpec;
  /** Where to write the resulting PNG. */
  outDir: string;
  width: number;
  height: number;
}

export interface ImageGenResult {
  pngPath: string;
  provenance: string;
}

export interface ImageGenAdapter {
  /** Stable provenance string (e.g. "fal-ai/flux/schnell"). */
  readonly id: string;
  generate(req: ImageGenRequest): Promise<ImageGenResult>;
}

/**
 * Compose a structured prompt that biases the model toward a clean T-pose
 * on a plain background — the rest of the pipeline (bg removal, segmentation)
 * is brittle on unconstrained AI art, so we constrain heavily here.
 */
function buildFalPrompt(spec: EnemySpec): string {
  const palette = spec.palette.length > 0 ? spec.palette.join(', ') : 'muted earth tones';
  const materials = spec.materials.length > 0 ? spec.materials.join(', ') : '';
  const optional = spec.optionalParts.length > 0 ? `holding/wearing: ${spec.optionalParts.join(', ')}` : '';
  const moodWord = spec.mood === 'neutral' ? '' : spec.mood;

  // The "T-pose, plain flat background" cues are critical for downstream
  // segmentation. Keep them at the end so the model honors them.
  return [
    `${moodWord} ${spec.prompt}`,
    materials ? `materials: ${materials}` : '',
    `palette: ${palette}`,
    optional,
    'standing T-pose, arms straight out horizontal, legs slightly apart, facing camera',
    'centered, full body visible, head to feet',
    'plain flat lavender background #b48dff, no shadow, no foreground objects',
    'painterly fantasy game art, clean silhouette, even lighting',
  ]
    .filter(Boolean)
    .join(', ');
}

export const falImageGen: ImageGenAdapter = {
  id: 'fal-ai/flux/schnell',
  async generate(req) {
    if (!process.env['FAL_KEY']) {
      throw new Error('FAL_KEY not set');
    }
    const { fal } = await import('@fal-ai/client');
    fal.config({ credentials: process.env['FAL_KEY']! });

    const result = (await fal.subscribe('fal-ai/flux/schnell', {
      input: {
        prompt: buildFalPrompt(req.spec),
        image_size: { width: req.width, height: req.height },
        num_inference_steps: 4,
        num_images: 1,
        seed: req.spec.seed,
      },
    })) as { data: { images: Array<{ url: string }> } };

    const url = result.data?.images?.[0]?.url;
    if (!url) throw new Error('FAL returned no image URL');
    const response = await fetch(url);
    if (!response.ok) throw new Error(`FAL image download failed: HTTP ${response.status}`);
    const buf = Buffer.from(await response.arrayBuffer());

    const pngPath = resolve(req.outDir, `${req.spec.id}.neutral.png`);
    await writeFile(pngPath, buf);
    return { pngPath, provenance: this.id };
  },
};

/**
 * Stub adapter used by tests and when FAL_KEY is absent. Produces a
 * recognizable silhouette PNG so the rest of the pipeline can still flow,
 * but the resulting bundle should not be considered shipping quality —
 * downstream evaluators will score it low and the orchestrator may fall
 * back to flat-color output.
 */
export const stubImageGen: ImageGenAdapter = {
  id: 'placeholder:silhouette',
  async generate(req) {
    const { default: sharp } = await import('sharp');
    // SVG depicting a centered T-pose silhouette — head, torso, arms, legs.
    // Kept simple so segmentation heuristics consistently find the regions.
    const w = req.width;
    const h = req.height;
    const cx = w / 2;
    // Body proportions (fractions of canvas height):
    const headTop = h * 0.08;
    const headBot = h * 0.22;
    const armY = h * 0.30;
    const armHalfW = w * 0.42;
    const torsoBot = h * 0.58;
    const hipBot = h * 0.65;
    const legBot = h * 0.95;
    const torsoHalfW = w * 0.14;
    const hipHalfW = w * 0.13;
    const limbHalfW = w * 0.05;
    const headHalfW = w * 0.10;
    const fill = '#604838';
    const bg = '#b48dff';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <rect width="${w}" height="${h}" fill="${bg}"/>
  <ellipse cx="${cx}" cy="${(headTop + headBot) / 2}" rx="${headHalfW}" ry="${(headBot - headTop) / 2}" fill="${fill}"/>
  <rect x="${cx - torsoHalfW}" y="${headBot}" width="${torsoHalfW * 2}" height="${torsoBot - headBot}" fill="${fill}"/>
  <rect x="${cx - hipHalfW}" y="${torsoBot}" width="${hipHalfW * 2}" height="${hipBot - torsoBot}" fill="${fill}"/>
  <rect x="${cx - armHalfW}" y="${armY - limbHalfW}" width="${armHalfW * 2}" height="${limbHalfW * 2}" fill="${fill}"/>
  <rect x="${cx - hipHalfW * 0.85}" y="${hipBot}" width="${limbHalfW * 1.6}" height="${legBot - hipBot}" fill="${fill}"/>
  <rect x="${cx + hipHalfW * 0.85 - limbHalfW * 1.6}" y="${hipBot}" width="${limbHalfW * 1.6}" height="${legBot - hipBot}" fill="${fill}"/>
</svg>`;
    const png = await sharp(Buffer.from(svg, 'utf8')).png().toBuffer();
    const pngPath = resolve(req.outDir, `${req.spec.id}.neutral.png`);
    await writeFile(pngPath, png);
    return { pngPath, provenance: this.id };
  },
};

export function pickImageGen(): ImageGenAdapter {
  return process.env['FAL_KEY'] ? falImageGen : stubImageGen;
}
