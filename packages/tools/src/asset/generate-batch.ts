import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import type { ToolContract, ToolExecutionContext } from '@agent-harness/core';
import { upsertManifestEntry, generateImageBuffer, generatePlaceholderBuffer } from './manifest-utils.js';

interface BatchRequest {
  key: string;
  prompt: string;
  width?: number;
  height?: number;
  scene?: string;
  type?: 'image' | 'spritesheet';
}

interface GenerateBatchInput {
  requests: BatchRequest[];
  /** Style prefix applied to every image for visual consistency */
  styleGuide?: string;
}

interface BatchResultEntry {
  key: string;
  path: string;
  status: 'generated' | 'placeholder';
  error?: string;
}

interface GenerateBatchOutput {
  results: BatchResultEntry[];
  generatedCount: number;
  placeholderCount: number;
  errorCount: number;
}

export const generateBatchTool: ToolContract<GenerateBatchInput, GenerateBatchOutput> = {
  name: 'asset__generateBatch',
  group: 'asset',
  description:
    'Generate multiple game asset images in one call. Applies a shared styleGuide to all images ' +
    'for visual consistency. Uses FAL.ai FLUX when FAL_KEY is set; falls back to colored ' +
    'placeholders. Registers all entries in src/assets/manifest.json. ' +
    'Prefer this over calling asset__generateImage repeatedly.',
  inputSchema: {
    type: 'object',
    properties: {
      requests: {
        type: 'array',
        description: 'List of images to generate',
        items: {
          type: 'object',
          properties: {
            key: { type: 'string', description: 'Unique snake_case artKey' },
            prompt: { type: 'string', description: 'Subject description for this specific image' },
            width: { type: 'number', description: 'Pixel width (default 512)' },
            height: { type: 'number', description: 'Pixel height (default 512)' },
            scene: { type: 'string', description: 'Godot scene key (default "BootScene")' },
            type: { type: 'string', enum: ['image', 'spritesheet'] },
          },
          required: ['key', 'prompt'],
        },
      },
      styleGuide: {
        type: 'string',
        description: 'Style prefix shared across all images, e.g. "dark sci-fi card art, painterly, consistent palette"',
      },
    },
    required: ['requests'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      results: { type: 'array' },
      generatedCount: { type: 'number' },
      placeholderCount: { type: 'number' },
      errorCount: { type: 'number' },
    },
  },
  permissions: ['fs:read', 'fs:write', 'asset:generate'],
  async execute(input: GenerateBatchInput, ctx: ToolExecutionContext): Promise<GenerateBatchOutput> {
    const outDir = join(ctx.projectPath, 'src', 'assets', 'generated', 'sprites');
    await mkdir(outDir, { recursive: true });

    const hasFal = Boolean(process.env['FAL_KEY']);
    const results: BatchResultEntry[] = [];
    let generatedCount = 0;
    let placeholderCount = 0;
    let errorCount = 0;

    for (const req of input.requests) {
      const w = req.width ?? 512;
      const h = req.height ?? 512;
      const outFile = join(outDir, `${req.key}.png`);
      const relPath = `src/assets/generated/sprites/${req.key}.png`;

      let status: 'generated' | 'placeholder' = 'placeholder';
      let model = 'placeholder';
      let errorMsg: string | undefined;
      let buffer: Buffer;

      if (hasFal) {
        try {
          const result = await generateImageBuffer(req.key, req.prompt, input.styleGuide, w, h);
          buffer = result.buffer;
          status = 'generated';
          model = result.model;
          generatedCount++;
        } catch (err) {
          errorMsg = err instanceof Error ? err.message : String(err);
          errorCount++;
          buffer = generatePlaceholderBuffer(req.key, w, h);
          placeholderCount++;
        }
      } else {
        buffer = generatePlaceholderBuffer(req.key, w, h);
        placeholderCount++;
      }

      try {
        await writeFile(outFile, buffer);
        await upsertManifestEntry(ctx.projectPath, {
          key: req.key,
          type: req.type ?? 'image',
          path: relPath,
          scene: req.scene ?? 'BootScene',
          usage: req.prompt.slice(0, 80),
          status,
          generatedAt: new Date().toISOString(),
          qualityScore: status === 'generated' ? 7 : 0,
          provenance: model,
          resolution: `${w}x${h}`,
        });
        results.push({ key: req.key, path: relPath, status, ...(errorMsg ? { error: errorMsg } : {}) });
      } catch (writeErr) {
        errorCount++;
        results.push({ key: req.key, path: relPath, status: 'placeholder', error: String(writeErr) });
      }
    }

    return { results, generatedCount, placeholderCount, errorCount };
  },
};
