import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import type { AssetManifest, AssetEntry } from '../types/asset.js';

const MANIFEST_PATH = 'src/assets/manifest.json';

export async function readManifest(projectPath: string): Promise<AssetManifest> {
  const fullPath = join(projectPath, MANIFEST_PATH);
  try {
    const raw = await readFile(fullPath, 'utf8');
    return JSON.parse(raw) as AssetManifest;
  } catch {
    return { version: '1.0.0', gameId: '', assets: [] };
  }
}

export async function writeManifest(projectPath: string, manifest: AssetManifest): Promise<void> {
  const fullPath = join(projectPath, MANIFEST_PATH);
  await writeFile(fullPath, JSON.stringify(manifest, null, 2), 'utf8');
}

export async function registerAsset(projectPath: string, entry: AssetEntry): Promise<void> {
  const manifest = await readManifest(projectPath);
  const idx = manifest.assets.findIndex((a) => a.key === entry.key);
  if (idx >= 0) {
    manifest.assets[idx] = entry;
  } else {
    manifest.assets.push(entry);
  }
  await writeManifest(projectPath, manifest);
}
