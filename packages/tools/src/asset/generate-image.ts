import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import type { ToolContract, ToolExecutionContext } from '@agent-harness/core';
import { upsertManifestEntry, generateImageBuffer, generatePlaceholderBuffer } from './manifest-utils.js';

interface GenerateImageInput {
  /** Unique snake_case key used as the asset artKey, e.g. "card_strike" */
  key: string;
  /** What to draw — the subject, not the style */
  prompt: string;
  /** Style prefix shared across all assets for visual consistency, e.g. "dark sci-fi card art, painterly" */
  styleGuide?: string;
  width?: number;
  height?: number;
  /** Godot scene that will load this asset, e.g. "BootScene" */
  scene?: string;
}

interface GenerateImageOutput {
  key: string;
  /** Relative path from project root, e.g. "src/assets/generated/sprites/card_strike.png" */
  path: string;
  status: 'generated' | 'placeholder';
  model: string;
  width: number;
  height: number;
}

export const generateImageTool: ToolContract<GenerateImageInput, GenerateImageOutput> = {
  name: 'asset__generateImage',
  group: 'asset',
  description:
    'Generate a single game asset image. Uses FAL.ai FLUX when FAL_KEY is set; falls back to a ' +
    'colored placeholder. Saves to src/assets/generated/sprites/ and registers the entry in ' +
    'src/assets/manifest.json. Use asset__generateBatch for multiple assets at once.',
  inputSchema: {
    type: 'object',
    properties: {
      key: { type: 'string', description: 'Unique snake_case artKey, e.g. "card_strike"' },
      prompt: { type: 'string', description: 'Subject description — do not include style here' },
      styleGuide: { type: 'string', description: 'Style prefix applied to all assets, e.g. "dark fantasy card art, painterly"' },
      width: { type: 'number', description: 'Pixel width (default 512, use 256 for small icons)' },
      height: { type: 'number', description: 'Pixel height (default 512, use 768 for portrait cards)' },
      scene: { type: 'string', description: 'Godot scene that loads this asset (default "BootScene")' },
    },
    required: ['key', 'prompt'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      key: { type: 'string' },
      path: { type: 'string' },
      status: { type: 'string' },
      model: { type: 'string' },
      width: { type: 'number' },
      height: { type: 'number' },
    },
  },
  permissions: ['fs:read', 'fs:write', 'asset:generate'],
  async execute(input: GenerateImageInput, ctx: ToolExecutionContext): Promise<GenerateImageOutput> {
    const w = input.width ?? 512;
    const h = input.height ?? 512;
    const outDir = join(ctx.projectPath, 'src', 'assets', 'generated', 'sprites');
    const outFile = join(outDir, `${input.key}.png`);
    const relPath = `src/assets/generated/sprites/${input.key}.png`;

    await mkdir(outDir, { recursive: true });

    let status: 'generated' | 'placeholder' = 'placeholder';
    let model = 'placeholder';
    let buffer: Buffer;

    if (process.env['FAL_KEY']) {
      try {
        const result = await generateImageBuffer(input.key, input.prompt, input.styleGuide, w, h);
        buffer = result.buffer;
        status = 'generated';
        model = result.model;
      } catch (err) {
        console.warn(`[asset__generateImage] FAL failed for "${input.key}": ${err}`);
        buffer = generatePlaceholderBuffer(input.key, w, h);
      }
    } else {
      buffer = generatePlaceholderBuffer(input.key, w, h);
    }

    await writeFile(outFile, buffer);

    await upsertManifestEntry(ctx.projectPath, {
      key: input.key,
      type: 'image',
      path: relPath,
      scene: input.scene ?? 'BootScene',
      usage: input.prompt.slice(0, 80),
      status,
      generatedAt: new Date().toISOString(),
      qualityScore: status === 'generated' ? 7 : 0,
      provenance: model,
      resolution: `${w}x${h}`,
    });

    return { key: input.key, path: relPath, status, model, width: w, height: h };
  },
};
