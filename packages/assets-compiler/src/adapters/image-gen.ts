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
 * on a plain background — the rest of the pipeline (bg removal, segmentation,
 * landmark detection) is brittle on unconstrained AI art, so we constrain
 * heavily here.
 *
 * FLUX/schnell at 4 inference steps is bad at honoring detailed pose
 * instructions, so we stack many redundant cues and explicitly refuse the
 * defaults the model loves (battle pose, holding weapon, dynamic action).
 * Wearable/wielded items from `spec.optionalParts` are retained — but
 * always in T-pose orientation, never raised or in motion.
 */
function buildFalPrompt(spec: EnemySpec): string {
  const palette = spec.palette.length > 0 ? spec.palette.join(', ') : 'muted earth tones';
  const materials = spec.materials.length > 0 ? spec.materials.join(', ') : '';
  const moodWord = spec.mood === 'neutral' ? '' : spec.mood;

  // Optional items in T-pose orientation only (no raised weapons, no action grip).
  const optionalT = spec.optionalParts.length > 0
    ? `${spec.optionalParts.join(', ')} held in resting T-pose, weapons pointed straight down, no action grip`
    : '';

  return [
    // Subject
    `${moodWord} ${spec.prompt}`.trim(),
    materials ? `materials: ${materials}` : '',
    `palette: ${palette}`,
    optionalT,

    // Pose — heavy redundancy because FLUX/schnell often ignores single cues.
    'character reference sheet, neutral mannequin T-pose',
    'both arms perfectly horizontal, fully extended outward at chest height',
    'arms straight as a horizontal bar, hands open palm forward at canvas edges',
    'legs straight and slightly apart, feet flat on ground',
    'standing upright, facing the camera directly, no torso rotation',
    'symmetric pose, both sides identical',

    // What we explicitly do NOT want — phrased positively because FLUX has
    // no negative-prompt support, but the model still avoids these cues.
    'static pose only, no motion, no battle stance, no action, no swinging, no leaning',
    'no weapons raised, no attacking, no dynamic posture',

    // Framing
    'full body, head to feet, centered, vertical full-figure portrait',
    'plain flat solid lavender background #b48dff, completely empty background',
    'no ground, no shadow, no environment, no props, nothing behind the figure',

    // Style
    'painterly fantasy game art, clean silhouette, even diffuse lighting, sharp edges',
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
