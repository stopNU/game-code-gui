import { readFile, writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';

export interface ManifestEntry {
  key: string;
  type: string;
  path: string;
  scene: string;
  usage: string;
  status: 'generated' | 'placeholder';
  generatedAt: string;
  qualityScore: number;
  provenance: string;
  resolution?: string;
}

interface AssetManifest {
  version: string;
  gameId: string;
  assets: ManifestEntry[];
}

const MANIFEST_REL = 'src/assets/manifest.json';

export async function upsertManifestEntry(projectPath: string, entry: ManifestEntry): Promise<void> {
  const manifestPath = join(projectPath, MANIFEST_REL);
  await mkdir(dirname(manifestPath), { recursive: true });

  let manifest: AssetManifest = { version: '1.0.0', gameId: '', assets: [] };
  try {
    const raw = await readFile(manifestPath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<AssetManifest>;
    // Handle legacy manifest format (textures/audio/fonts arrays instead of assets)
    manifest = {
      version: parsed.version ?? '1.0.0',
      gameId: parsed.gameId ?? '',
      assets: parsed.assets ?? [],
    };
  } catch {
    // File missing or unparseable — start fresh
  }

  const idx = manifest.assets.findIndex((a) => a.key === entry.key);
  if (idx >= 0) {
    manifest.assets[idx] = entry;
  } else {
    manifest.assets.push(entry);
  }

  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
}

export async function generateImageBuffer(
  key: string,
  prompt: string,
  styleGuide: string | undefined,
  width: number,
  height: number,
): Promise<{ buffer: Buffer; model: string }> {
  const falKey = process.env['FAL_KEY'];
  if (!falKey) throw new Error('FAL_KEY env var not set');

  const { fal } = await import('@fal-ai/client');
  fal.config({ credentials: falKey });

  const stylePrefix = styleGuide
    ? `${styleGuide}, `
    : 'fantasy card game art, painterly illustration, dark atmospheric, ';

  const result = await fal.subscribe('fal-ai/flux/schnell', {
    input: {
      prompt: stylePrefix + prompt,
      image_size: { width, height },
      num_inference_steps: 4,
      num_images: 1,
    },
  }) as { data: { images: Array<{ url: string }> } };

  const imageUrl = result.data?.images?.[0]?.url;
  if (!imageUrl) throw new Error(`FAL returned no image URL for key "${key}"`);

  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error(`Failed to download FAL image: HTTP ${response.status}`);
  return { buffer: Buffer.from(await response.arrayBuffer()), model: 'fal-ai/flux/schnell' };
}

/**
 * Returns a minimal 1×1 transparent PNG as a placeholder.
 * The packages/assets pipeline produces proper colored placeholders via sharp;
 * this stub exists only so the tools package has no sharp dependency.
 */
export function generatePlaceholderBuffer(
  _key: string,
  _width: number,
  _height: number,
): Buffer {
  // Minimal 1×1 transparent PNG (68 bytes)
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64',
  );
}
