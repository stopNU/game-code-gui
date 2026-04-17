import { readFile, writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { generateWithFal } from '../generators/fal-generator.js';
import { generatePlaceholder } from '../generators/placeholder.js';
import { registerAsset } from '../manifest/manifest-io.js';
import type { AssetRequest, AssetEntry } from '../types/asset.js';

export type ContentType = 'cards' | 'enemies' | 'relics';

export interface ContentArtResult {
  artKey: string;
  outputPath: string;
  status: 'generated' | 'placeholder' | 'skipped' | 'approved' | 'failed';
  error?: string;
}

export interface ContentArtOptions {
  projectPath: string;
  type: ContentType;
  /** Style guide string applied to all prompts. Defaults to deckbuilder pixel art style. */
  styleGuide?: string;
  /** If false (default), falls back to placeholder when FAL_KEY is absent. */
  requireFal?: boolean;
}

/** Dimensions by content type, matching the asset agent spec. */
function dimensionsFor(type: ContentType): { width: number; height: number } {
  switch (type) {
    case 'cards':
      return { width: 256, height: 256 };
    case 'enemies':
      return { width: 256, height: 384 };
    case 'relics':
      return { width: 64, height: 64 };
  }
}

/** Usage label for manifest registration. */
function usageFor(type: ContentType): string {
  switch (type) {
    case 'cards':
      return 'card art';
    case 'enemies':
      return 'enemy portrait';
    case 'relics':
      return 'relic icon';
  }
}

/**
 * Generate art for all entries of one content type that have an artPrompt but no artKey.
 *
 * Flow:
 *   1. Read src/data/content/{type}.json
 *   2. For each entry with non-empty artPrompt and empty artKey:
 *      a. Build an AssetRequest from the artPrompt + dimensions
 *      b. Generate via FAL.ai (or placeholder if FAL_KEY absent)
 *      c. Save PNG to src/assets/generated/{artKey}.png
 *      d. Update the content JSON entry: set artKey
 *      e. Register in manifest
 *   3. Write the updated content JSON back to disk
 */
export async function generateContentArt(opts: ContentArtOptions): Promise<ContentArtResult[]> {
  const { projectPath, type } = opts;
  const styleGuide = opts.styleGuide
    ?? 'pixel art, 16-bit style, dark fantasy dungeon aesthetic, muted color palette with accent colors';

  const contentFile = join(projectPath, 'src', 'data', 'content', `${type}.json`);
  const generatedDir = join(projectPath, 'src', 'assets', 'generated');
  await mkdir(generatedDir, { recursive: true });

  let entries: Array<Record<string, unknown>>;
  try {
    const raw = await readFile(contentFile, 'utf8');
    entries = JSON.parse(raw) as Array<Record<string, unknown>>;
  } catch (err) {
    throw new Error(`Cannot read ${contentFile}: ${err instanceof Error ? err.message : String(err)}`);
  }

  const dims = dimensionsFor(type);
  const usage = usageFor(type);
  const results: ContentArtResult[] = [];
  let modified = false;

  for (const entry of entries) {
    const id = String(entry['id'] ?? '');
    const artPrompt = String(entry['artPrompt'] ?? '');
    const existingKey = String(entry['artKey'] ?? '');

    if (!artPrompt || existingKey) {
      results.push({ artKey: existingKey || `${type}_${id}`, outputPath: '', status: 'skipped' });
      continue;
    }

    const artKey = `${type}_${id}`;
    const outputPath = join(generatedDir, `${artKey}.png`);

    // Build prompt: subject first, style at end, keep under 200 words
    let prompt = artPrompt;
    if (type === 'enemies') {
      prompt = `${artPrompt} full body portrait, standing pose`;
    } else {
      prompt = `${artPrompt} transparent background`;
    }

    const request: AssetRequest = {
      key: artKey,
      type: 'image',
      prompt,
      ...dims,
      styleGuide,
      usage,
    };

    try {
      let genResult;
      if (process.env['FAL_KEY'] && process.env['FAL_KEY'] !== '') {
        try {
          genResult = await generateWithFal(request, generatedDir);
        } catch (falErr) {
          console.warn(`[content-art] FAL failed for ${artKey}, using placeholder: ${falErr}`);
          genResult = await generatePlaceholder(request, generatedDir);
        }
      } else {
        genResult = await generatePlaceholder(request, generatedDir);
      }

      const entry_: AssetEntry = {
        key: artKey,
        type: 'image',
        path: `src/assets/generated/${artKey}.png`,
        scene: 'all',
        usage,
        resolution: `${dims.width}x${dims.height}`,
        status: genResult.status,
        generatedAt: new Date().toISOString(),
        provenance: genResult.provenance,
      };
      await registerAsset(projectPath, entry_);

      // Update the content JSON entry
      entry['artKey'] = artKey;
      modified = true;

      results.push({ artKey, outputPath: genResult.outputPath, status: genResult.status });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ artKey, outputPath, status: 'placeholder', error: msg });
    }
  }

  if (modified) {
    await writeFile(contentFile, JSON.stringify(entries, null, 2), 'utf8');
  }

  return results;
}

/**
 * Generate art for all three content types: cards, enemies, relics.
 */
export async function generateAllContentArt(
  projectPath: string,
  styleGuide?: string,
): Promise<Record<ContentType, ContentArtResult[]>> {
  const types: ContentType[] = ['cards', 'enemies', 'relics'];
  const allResults: Record<string, ContentArtResult[]> = {};

  for (const type of types) {
    try {
      allResults[type] = await generateContentArt({
        projectPath,
        type,
        ...(styleGuide !== undefined ? { styleGuide } : {}),
      });
    } catch (err) {
      console.warn(`[content-art] Skipping ${type}: ${err instanceof Error ? err.message : String(err)}`);
      allResults[type] = [];
    }
  }

  return allResults as Record<ContentType, ContentArtResult[]>;
}
