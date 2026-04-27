import type { EnemySpec } from '../types/enemy-spec.js';
import type { VisualOutput } from '../types/visual.js';
import type { Stage } from '../orchestrator/stage-runner.js';

/**
 * Phase 1 stub: produces a deterministic per-region color map derived from
 * the spec's palette and returns a `kind: 'flat-colors'` visual output.
 * The exporter renders parts as flat-colored Polygon2D nodes.
 *
 * Phase 2's `visualStage` (in ./visual.ts) wraps this as the fallback path
 * when image-gen fails. The stub is kept as a standalone export so tests
 * can opt into the deterministic flat-color path without a FAL key.
 */

const COLOR_WORDS: Record<string, string> = {
  rust: '#8a3a1f',
  bone: '#dcd2b5',
  soot: '#2c2520',
  ember: '#c4501c',
  ash: '#7a7268',
  moss: '#3e5a2c',
  jade: '#3a8a64',
  crimson: '#8a1f2c',
  azure: '#2c5e8a',
  gold: '#c69a3a',
  silver: '#a8b0b8',
  shadow: '#1a1820',
  blood: '#5e1218',
  ivory: '#e8dec8',
  obsidian: '#0d0c14',
};

function paletteHexes(palette: string[]): string[] {
  const hexes = palette.map((p) => COLOR_WORDS[p.toLowerCase()] ?? '#6a5a4a');
  return hexes.length > 0 ? hexes : ['#6a5a4a', '#3a3038'];
}

function shadeRegion(region: string, palette: string[]): string {
  const hexes = paletteHexes(palette);
  const limb = hexes[1] ?? hexes[0]!;
  if (region === 'head') return liftHex(hexes[0]!, 16);
  if (region === 'torso' || region === 'hip') return hexes[0]!;
  return limb;
}

function liftHex(hex: string, amount: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1]!, 16);
  const r = Math.min(255, ((n >> 16) & 0xff) + amount);
  const g = Math.min(255, ((n >> 8) & 0xff) + amount);
  const b = Math.min(255, (n & 0xff) + amount);
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

export const REQUIRED_REGIONS = [
  'head', 'torso', 'hip',
  'l_upper_arm', 'l_lower_arm', 'l_hand',
  'r_upper_arm', 'r_lower_arm', 'r_hand',
  'l_upper_leg', 'l_lower_leg', 'l_foot',
  'r_upper_leg', 'r_lower_leg', 'r_foot',
];

export const visualStubStage: Stage<EnemySpec, VisualOutput> = {
  name: 'visual',
  async run(spec, ctx) {
    const regionColors: Record<string, string> = {};
    for (const region of REQUIRED_REGIONS) {
      regionColors[region] = shadeRegion(region, spec.palette);
    }
    const output: VisualOutput = { kind: 'flat-colors', regionColors };
    await ctx.graph.writeJson('visual', 'output.json', output);
    return { output, score: 1.0 };
  },
};
