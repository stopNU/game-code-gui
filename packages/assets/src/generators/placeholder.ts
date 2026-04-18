import { writeFile, mkdir } from 'fs/promises';
import { dirname, join } from 'path';
import type { AssetRequest, AssetGenerationResult } from '../types/asset.js';

/**
 * Generate a PNG placeholder image using sharp (SVG→PNG rasterisation).
 * Produces a colored rectangle with a key label as a raster PNG.
 *
 * For audio: writes a minimal silent WAV (unchanged).
 */
export async function generatePlaceholder(
  request: AssetRequest,
  outputDir: string,
): Promise<AssetGenerationResult> {
  const w = request.width ?? 64;
  const h = request.height ?? 64;
  const ext = request.type === 'audio' ? 'wav' : 'png';
  const filename = `${request.key}.${ext}`;
  const outputPath = join(outputDir, filename);

  await mkdir(dirname(outputPath), { recursive: true });

  if (request.type === 'audio') {
    await writeFile(outputPath, createSilentWav());
    return {
      request,
      outputPath,
      status: 'placeholder',
      qualityScore: 0,
      provenance: 'generated:placeholder',
    };
  }

  const color = hashColor(request.key);
  const opacity = request.transparent ? '0.8' : '1';
  const fontSize = Math.max(8, Math.min(12, w / 6));
  const label = request.key.slice(0, 8);

  // Build an SVG at the target dimensions and rasterise it to PNG via sharp.
  // sharp bundles prebuilt binaries with librsvg on all platforms (including
  // Windows), so no system dependencies are required.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <rect width="${w}" height="${h}" fill="${color}" opacity="${opacity}"/>
  <text x="${w / 2}" y="${h / 2 + 4}" font-family="monospace" font-size="${fontSize}"
        fill="white" text-anchor="middle" dominant-baseline="middle">${label}</text>
</svg>`;

  try {
    const { default: sharp } = await import('sharp');
    const png = await sharp(Buffer.from(svg, 'utf8')).png().toBuffer();
    await writeFile(outputPath, png);
  } catch {
    // sharp unavailable — fall back to writing the SVG so the pipeline doesn't break
    const svgPath = outputPath.replace('.png', '.svg');
    await writeFile(svgPath, svg, 'utf8');
    return {
      request,
      outputPath: svgPath,
      status: 'placeholder',
      qualityScore: 0,
      provenance: 'generated:placeholder:svg-fallback',
    };
  }

  return {
    request,
    outputPath,
    status: 'placeholder',
    qualityScore: 0,
    provenance: 'generated:placeholder',
  };
}

function hashColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash) % 360;
  return `hsl(${h}, 60%, 40%)`;
}

function createSilentWav(): Buffer {
  // Minimal 44-byte WAV header for 0.1s of silence at 8000 Hz mono
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);   // PCM
  header.writeUInt16LE(1, 22);   // mono
  header.writeUInt32LE(8000, 24); // sample rate
  header.writeUInt32LE(8000, 28); // byte rate
  header.writeUInt16LE(1, 32);   // block align
  header.writeUInt16LE(8, 34);   // bits per sample
  header.write('data', 36);
  header.writeUInt32LE(0, 40);
  return header;
}
