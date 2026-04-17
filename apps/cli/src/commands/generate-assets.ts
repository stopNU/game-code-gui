import { resolve } from 'path';
import { runAssetPipeline, generateAllContentArt } from '@agent-harness/assets';
import { loadHarnessConfig } from '../utils/config-loader.js';
import { spinner, c, printSection, printTable } from '../utils/output.js';
import type { AssetType } from '@agent-harness/assets';

export interface GenerateAssetsOptions {
  project: string;
  /** Generate from artPrompt fields in content JSON files (cards, enemies, relics) */
  content?: boolean;
  /** Style guide for content art generation */
  style?: string;
  type?: string;
  request?: string;
  key?: string;
  width?: string;
  height?: string;
}

export async function generateAssets(opts: GenerateAssetsOptions): Promise<void> {
  loadHarnessConfig();

  const projectPath = resolve(process.cwd(), opts.project);

  // Content mode: read artPrompt from content JSON files and generate art
  if (opts.content) {
    const genSpinner = spinner('Generating art from artPrompt fields in content JSON files...');
    try {
      const results = await generateAllContentArt(projectPath, opts.style);

      const rows = Object.entries(results).flatMap(([type, typeResults]) =>
        typeResults.map((r) => ({
          type,
          artKey: r.artKey,
          status: r.status,
          ...(r.error ? { error: r.error.slice(0, 60) } : {}),
        })),
      );

      const generated = rows.filter((r) => r.status === 'generated').length;
      const placeholders = rows.filter((r) => r.status === 'placeholder').length;
      const skipped = rows.filter((r) => r.status === 'skipped').length;

      genSpinner.succeed(`Content art complete: ${generated} generated, ${placeholders} placeholder, ${skipped} skipped`);

      printSection('Results');
      printTable(rows);

      if (!process.env['FAL_KEY']) {
        console.log(c.warn('Set FAL_KEY to generate real images. Placeholders were used.'));
      }
    } catch (err) {
      genSpinner.fail('Content art generation failed');
      throw err;
    }
    return;
  }

  // Individual mode: generate a single asset from --request
  if (!opts.request) {
    throw new Error('--request is required (or use --content to generate from artPrompt fields)');
  }

  const assetType = (opts.type ?? 'image') as AssetType;
  const key = opts.key ?? opts.request.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 20);

  const genSpinner = spinner(`Generating ${assetType}: "${opts.request}"...`);

  let result;
  try {
    result = await runAssetPipeline({
      projectPath,
      requests: [
        {
          key,
          type: assetType,
          prompt: opts.request,
          width: opts.width ? parseInt(opts.width, 10) : 256,
          height: opts.height ? parseInt(opts.height, 10) : 256,
          transparent: assetType === 'image',
          usage: opts.request,
        },
      ],
      useExternalGenerators: Boolean(process.env['FAL_KEY']),
    });

    if (result.errors.length > 0) {
      genSpinner.warn('Generated with warnings');
    } else {
      genSpinner.succeed('Asset generated');
    }
  } catch (err) {
    genSpinner.fail('Generation failed');
    throw err;
  }

  printSection('Generated assets');
  printTable(
    result.registered.map((a) => ({
      key: a.key,
      type: a.type,
      status: a.status,
      path: a.path,
    })),
  );

  if (result.errors.length > 0) {
    printSection('Errors');
    result.errors.forEach((e) => console.log(c.error(e)));
  }

  console.log();
  console.log(c.info('Asset registered in src/assets/manifest.json'));
  if (result.registered[0]?.status === 'placeholder') {
    console.log(c.warn('Asset is a placeholder. Set FAL_KEY to generate real images with FAL.ai.'));
  }
}
