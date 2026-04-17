import { join } from 'path';
import type { AssetRequest, AssetGenerationResult, AssetEntry } from '../types/asset.js';
import { generatePlaceholder } from '../generators/placeholder.js';
import { generateWithFal } from '../generators/fal-generator.js';
import { registerAsset } from '../manifest/manifest-io.js';

export interface PipelineOptions {
  projectPath: string;
  requests: AssetRequest[];
  useExternalGenerators?: boolean;
}

export interface PipelineResult {
  results: AssetGenerationResult[];
  registered: AssetEntry[];
  errors: string[];
}

export async function runAssetPipeline(opts: PipelineOptions): Promise<PipelineResult> {
  const results: AssetGenerationResult[] = [];
  const registered: AssetEntry[] = [];
  const errors: string[] = [];

  const generatedDir = join(opts.projectPath, 'src', 'assets', 'generated');

  for (const request of opts.requests) {
    try {
      let result: AssetGenerationResult;

      const outDir = join(generatedDir, typeToDir(request.type));
      if (opts.useExternalGenerators && process.env['FAL_KEY'] && request.type !== 'audio') {
        try {
          result = await generateWithFal(request, outDir);
        } catch (falErr) {
          console.warn(`[assets] FAL failed for ${request.key}, using placeholder: ${falErr}`);
          result = await generatePlaceholder(request, outDir);
        }
      } else {
        result = await generatePlaceholder(request, outDir);
      }

      results.push(result);

      const entry: AssetEntry = {
        key: request.key,
        type: request.type,
        path: result.outputPath.replace(opts.projectPath + '/', ''),
        scene: request.scene ?? 'all',
        usage: request.usage ?? request.prompt.slice(0, 60),
        status: result.status,
        generatedAt: new Date().toISOString(),
        qualityScore: result.qualityScore,
        provenance: result.provenance,
        ...(request.width ? { resolution: `${request.width}x${request.height ?? request.width}` } : {}),
        ...(request.frameWidth !== undefined ? { frameWidth: request.frameWidth } : {}),
        ...(request.frameHeight !== undefined ? { frameHeight: request.frameHeight } : {}),
        ...(request.frameCount !== undefined ? { frameCount: request.frameCount } : {}),
      };

      await registerAsset(opts.projectPath, entry);
      registered.push(entry);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${request.key}: ${msg}`);
    }
  }

  return { results, registered, errors };
}

function typeToDir(type: AssetRequest['type']): string {
  switch (type) {
    case 'image':
    case 'spritesheet':
    case 'atlas':
      return 'sprites';
    case 'audio':
      return 'audio';
    case 'tilemap':
      return 'tilemaps';
    default:
      return 'misc';
  }
}
